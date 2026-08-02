const { getClient } = require('./lib/supabase');
const { generateRoomCode, generateToken } = require('./lib/rooms');
const { ok, badRequest, serverError } = require('./lib/http');
const { normalizeMatchConfig } = require('./lib/engine');
const { bumpPulse } = require('./lib/pulse');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  const config = normalizeMatchConfig(body);
  const supabase = getClient();
  const hostResumeToken = generateToken();

  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode(4);
    const { data, error } = await supabase
      .from('rooms')
      .insert({ room_code: roomCode, host_resume_token: hostResumeToken, status: 'LOBBY', config, current_game_state: {} })
      .select('room_id, room_code')
      .single();
    if (!error) {
      // Seed the pulse row up front, so the host — who subscribes moments later
      // — is already watching a row that exists. Clients listen for UPDATE; with
      // no row there would be nothing to update until the first join.
      await bumpPulse(data.room_id, 0, 'LOBBY', data.room_code);
      return ok({ roomId: data.room_id, roomCode: data.room_code, hostResumeToken });
    }
    if (error.code !== '23505') { // unique_violation on room_code, anything else is a real error
      return serverError(error.message);
    }
  }
  return serverError('Could not allocate a unique room code, please try again.');
};
