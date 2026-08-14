// The server half of the Realtime doorbell.
//
// WHY: every screen used to poll get-state on a timer, which is what burned
// 191,384 Netlify function invocations and got the site auto-paused (WORKLOG
// entry 19). Clients now sit on a Supabase Realtime subscription instead and
// only call a function when something has actually changed. This is the thing
// that tells them something changed.
//
// room_pulse holds "room X is now at version N, status S" — no hands, no
// piles, no tokens — because Realtime broadcasts the whole row to every
// subscriber and anyone can read that table with the publishable key. That
// boundary still holds: publicState (below) must ONLY ever be the ALREADY
// PUBLIC snapshot from lib/views.js's buildPublicSnapshot() — exactly what
// get-public-state.js hands to anyone who asks for a room by code — never a
// full getPlayerView with a hand in it. If you ever want a player's PRIVATE
// state here, that is the signal it belongs in get-state instead.
//
// WHY publicState EXISTS: /tv used to treat this row as a pure doorbell — the
// nudge arrived, and /tv still had to make its OWN follow-up call to
// get-public-state to find out what changed. That follow-up call is a full
// Netlify Function round-trip (measured at ~250-300ms for this class of
// endpoint) stacked on top of however long the original action took, and it is
// pure overhead: this data was already going to be public the moment anyone
// asked. Carrying a snapshot in the row /tv is already subscribed to lets it
// render directly off the push. Player screens (/play, /host) ignore the extra
// field — their own fetch-on-change behaviour is unchanged, since they need a
// private, token-checked view this table must never carry.
const { getClient } = require('./supabase');

// Best-effort by design. A failed pulse must never fail the action that just
// succeeded: the write to `rooms` is the source of truth, and clients keep a
// slow safety-net poll precisely so a missed doorbell costs latency, not
// correctness. Swallow and log rather than throw.
// roomCode is carried so /tv, which is addressed by code rather than id, can
// filter its subscription without the public view having to expose room_id.
async function bumpPulse(roomId, stateVersion, status, roomCode, publicState) {
  try {
    const row = {
      room_id: roomId,
      state_version: stateVersion,
      status: status || 'LOBBY',
      updated_at: new Date().toISOString()
    };
    // Only write a field when the caller actually has a value for it, so a
    // caller that lacks one cannot blank out the last good value.
    if (roomCode) row.room_code = roomCode;
    if (publicState !== undefined) row.public_state = publicState;

    const { error } = await getClient()
      .from('room_pulse')
      .upsert(row, { onConflict: 'room_id' });
    if (error) console.error('[pulse] upsert failed', roomId, error.message);
  } catch (e) {
    console.error('[pulse] threw', roomId, e.message);
  }
}

// Lobby joins change what /host and /tv should show but do NOT bump
// rooms.state_version — the game state itself is untouched until Start. Without
// this, a player joining would not appear until the safety-net poll came round,
// which looks broken when four people are standing there tapping Join. Bumping
// updated_at alone is enough to fire a Realtime UPDATE.
async function pulseLobbyChange(roomId, stateVersion, roomCode, publicState) {
  return bumpPulse(roomId, stateVersion, 'LOBBY', roomCode, publicState);
}

module.exports = { bumpPulse, pulseLobbyChange };
