const crypto = require('crypto');
const { getClient } = require('./lib/supabase');
const { ok, badRequest, unauthorized, serverError } = require('./lib/http');

// PIN-gated admin endpoint for the person running the game. Two actions:
//
//   list — every room, who is in it, and how old it is. Exists because there is
//          otherwise no way to see what rooms are alive; they accumulate
//          silently and nothing ever cleans them up.
//   nuke — deletes every room, player and pulse row. Back to an empty database.
//
// THE PIN IS SHORT ON PURPOSE. Nick chose a memorable word over a random key,
// with the threat model stated explicitly: keep a mischievous nephew out, not a
// determined attacker. That trade is only sound because guessing is rate
// limited — see the lockout below. If the lockout is ever removed, the PIN
// stops being adequate and must become a long random secret again.
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Length is compared first because timingSafeEqual throws on a length mismatch.
// Timing is not a realistic attack against a lockout-protected PIN; this is just
// not doing the obviously wrong thing.
function pinMatches(supplied, expected) {
  const a = Buffer.from(String(supplied || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function readGuard(supabase) {
  const { data } = await supabase
    .from('admin_guard').select('*').eq('id', 'singleton').single();
  return data || { fail_count: 0, locked_until: null };
}

async function writeGuard(supabase, patch) {
  await supabase
    .from('admin_guard')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 'singleton');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  const expected = process.env.ADMIN_PIN;
  // Fail closed. If the variable is missing the endpoint is disabled outright,
  // rather than quietly accepting an empty PIN from anyone who finds the page.
  if (!expected) return serverError('ADMIN_PIN is not configured on this site.');

  const supabase = getClient();
  const guard = await readGuard(supabase);

  const lockedUntil = guard.locked_until ? Date.parse(guard.locked_until) : 0;
  if (lockedUntil > Date.now()) {
    const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Too many wrong PINs. Locked for another ${mins} minute${mins === 1 ? '' : 's'}.` })
    };
  }

  if (!pinMatches(body.pin, expected)) {
    const fails = (guard.fail_count || 0) + 1;
    if (fails >= MAX_FAILURES) {
      await writeGuard(supabase, { fail_count: 0, locked_until: new Date(Date.now() + LOCKOUT_MS).toISOString() });
      return unauthorized(`Wrong PIN. That was ${MAX_FAILURES} wrong tries — locked for 15 minutes.`);
    }
    await writeGuard(supabase, { fail_count: fails });
    return unauthorized(`Wrong PIN. ${MAX_FAILURES - fails} tr${MAX_FAILURES - fails === 1 ? 'y' : 'ies'} left before a 15 minute lockout.`);
  }

  // Correct PIN — forgive any accumulated failures.
  if (guard.fail_count || guard.locked_until) {
    await writeGuard(supabase, { fail_count: 0, locked_until: null });
  }

  if (body.action === 'list') {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('room_id, room_code, status, state_version, created_at, last_activity_at')
      .order('created_at', { ascending: false });
    if (error) return serverError(error.message);

    const { data: players } = await supabase
      .from('players').select('room_id, player_name, seat_number');

    // Names only. This endpoint is behind the PIN, but there is still no reason
    // to hand out resume tokens — nothing on the page needs them.
    const withPlayers = (rooms || []).map(r => ({
      ...r,
      players: (players || [])
        .filter(p => p.room_id === r.room_id)
        .sort((a, b) => a.seat_number - b.seat_number)
        .map(p => p.player_name)
    }));
    return ok({ rooms: withPlayers });
  }

  // Delete one room, leaving the rest alone. The full reset below is the "back
  // to 1" button; this is the one you actually reach for, because the normal
  // situation is one room you care about and one you don't — testing while a
  // real game is live, or clearing last week's clutter without touching
  // tonight's. It also fixes the specific annoyance of /host auto-resuming a
  // stale room: delete that room and the next visit starts clean.
  if (body.action === 'delete-room') {
    const code = String(body.roomCode || '').trim().toUpperCase();
    if (!code) return badRequest('A room code is required.');

    const { data: room } = await supabase
      .from('rooms').select('room_id, room_code').eq('room_code', code).single();
    if (!room) return badRequest(`No room with code ${code}.`);

    // Players first — their foreign key to rooms is not ON DELETE CASCADE.
    // room_pulse is cascaded and goes with the room.
    const { error: pErr } = await supabase.from('players').delete().eq('room_id', room.room_id);
    if (pErr) return serverError('Deleting that room\'s players failed: ' + pErr.message);

    const { error: rErr } = await supabase.from('rooms').delete().eq('room_id', room.room_id);
    if (rErr) return serverError('Deleting that room failed: ' + rErr.message);

    console.log(`[admin] deleted room ${code}`);
    return ok({ ok: true, deleted: code });
  }

  if (body.action === 'nuke') {
    // Second gate, deliberately not the PIN again: the PIN proves who you are,
    // this proves you meant it. Destructive and unrecoverable — any game in
    // progress dies with it.
    if (body.confirm !== 'NUKE') return badRequest('Confirmation text did not match.');

    const { data: doomed } = await supabase.from('rooms').select('room_id, room_code');
    const roomCount = (doomed || []).length;

    // Players first: their foreign key to rooms is not ON DELETE CASCADE, so
    // deleting rooms first would fail. room_pulse IS cascaded and goes with the
    // rooms on its own.
    const { error: pErr } = await supabase.from('players').delete().not('player_id', 'is', null);
    if (pErr) return serverError('Deleting players failed: ' + pErr.message);

    const { error: rErr } = await supabase.from('rooms').delete().not('room_id', 'is', null);
    if (rErr) return serverError('Deleting rooms failed: ' + rErr.message);

    // Belt and braces — if a pulse row ever outlived its room, it would leave a
    // doorbell ringing for a game that no longer exists.
    await supabase.from('room_pulse').delete().not('room_id', 'is', null);

    console.log(`[admin] full reset: removed ${roomCount} room(s): ${(doomed || []).map(r => r.room_code).join(', ') || 'none'}`);
    return ok({ ok: true, roomsDeleted: roomCount });
  }

  return badRequest('Unknown action.');
};
