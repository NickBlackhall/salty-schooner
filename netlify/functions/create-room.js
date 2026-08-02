const { getClient } = require('./lib/supabase');
const { generateRoomCode, generateToken, clampMaxPlayers } = require('./lib/rooms');
const { ok, badRequest, serverError } = require('./lib/http');
const { normalizeMatchConfig } = require('./lib/engine');
const { bumpPulse } = require('./lib/pulse');

// THE HOST IS A PLAYER (Nick, 2026-08-02). Creating a room used to mint only a
// host token — an anonymous control panel with no seat, no hand, and no way to
// play. Whoever ran the game either sat out or needed a second device to join
// their own room. Now create-room seats the host at seat 0 in the same breath,
// and hands back player credentials alongside the host token, so /host can send
// them straight to /play holding cards like everyone else.
//
// `hostName` is optional on purpose. Supplied (what the UI does) → the host is
// seated. Omitted → the old behaviour, a room with a host token and no seat.
// That costs one `if` and keeps a run-it-but-don't-play-it host possible without
// building UI for it; do not remove it assuming it is dead code.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  // maxPlayers is room capacity, not a game rule, so it is merged in here rather
  // than going through engine.js's rules-protected normalizeMatchConfig.
  const config = {
    ...normalizeMatchConfig(body),
    maxPlayers: clampMaxPlayers(body.maxPlayers)
  };
  const hostName = String(body.hostName || '').trim().slice(0, 24);
  const supabase = getClient();
  const hostResumeToken = generateToken();

  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode(4);
    const { data, error } = await supabase
      .from('rooms')
      .insert({ room_code: roomCode, host_resume_token: hostResumeToken, status: 'LOBBY', config, current_game_state: {} })
      .select('room_id, room_code')
      .single();

    if (error) {
      if (error.code !== '23505') { // unique_violation on room_code, anything else is a real error
        return serverError(error.message);
      }
      continue; // code collision — try another
    }

    const result = { roomId: data.room_id, roomCode: data.room_code, hostResumeToken };

    if (hostName) {
      const resumeToken = generateToken();
      const { data: player, error: seatErr } = await supabase
        .from('players')
        .insert({ room_id: data.room_id, player_name: hostName, seat_number: 0, resume_token: resumeToken })
        .select('player_id')
        .single();
      if (seatErr) {
        // Roll the room back rather than leaving one the host cannot play in.
        // A room whose creator has no seat is worse than no room at all: they
        // would be stuck on a lobby they can never join, holding a code they
        // have already read out to everyone.
        await supabase.from('rooms').delete().eq('room_id', data.room_id);
        return serverError('Could not seat the host: ' + seatErr.message);
      }
      result.playerId = player.player_id;
      result.resumeToken = resumeToken;
      result.seat = 0;
      result.hostName = hostName;
    }

    // Seed the pulse row up front, so the host — who subscribes moments later
    // — is already watching a row that exists. Clients listen for UPDATE; with
    // no row there would be nothing to update until the first join.
    await bumpPulse(data.room_id, 0, 'LOBBY', data.room_code);
    return ok(result);
  }
  return serverError('Could not allocate a unique room code, please try again.');
};
