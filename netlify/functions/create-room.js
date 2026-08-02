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
// `hostName` is REQUIRED. A seatless host was briefly kept as an option and then
// removed once it was actually tried: /play looks for player credentials, finds
// none, and shows "No saved seat found" with polling stopped — so that host held
// a token for a room they could not see, with no lobby, no room code to read out
// and no Start button. Every host is a player; there is no other kind.
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
  if (!hostName) return badRequest('A host name is required — the host plays too.');

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

    const resumeToken = generateToken();
    const { data: player, error: seatErr } = await supabase
      .from('players')
      .insert({ room_id: data.room_id, player_name: hostName, seat_number: 0, resume_token: resumeToken })
      .select('player_id')
      .single();
    if (seatErr) {
      // Roll the room back rather than leaving one the host cannot play in.
      // A room whose creator has no seat is worse than no room at all: they
      // would be stuck holding a code they have already read out to everyone,
      // looking at a page that says "No saved seat found".
      await supabase.from('rooms').delete().eq('room_id', data.room_id);
      return serverError('Could not seat the host: ' + seatErr.message);
    }

    // Seed the pulse row up front, so the host — who subscribes moments later
    // — is already watching a row that exists. Clients listen for UPDATE; with
    // no row there would be nothing to update until the first join.
    await bumpPulse(data.room_id, 0, 'LOBBY', data.room_code);
    return ok({
      roomId: data.room_id,
      roomCode: data.room_code,
      hostResumeToken,
      playerId: player.player_id,
      resumeToken,
      seat: 0,
      hostName
    });
  }
  return serverError('Could not allocate a unique room code, please try again.');
};
