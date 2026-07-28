const { getClient } = require('./lib/supabase');
const { ok, badRequest, notFound, unauthorized, serverError } = require('./lib/http');
const { loadRoom, verifyHost } = require('./lib/access');

// Wipes game progress and returns the room to LOBBY, keeping the same room
// code and the same seated players (their tokens are untouched), so nobody
// has to rejoin. Only the host can call this.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  const room = await loadRoom(body.roomId);
  if (!room) return notFound('Room not found.');
  if (!verifyHost(room, body.hostResumeToken)) return unauthorized('Bad host token.');

  const supabase = getClient();
  const { error } = await supabase
    .from('rooms')
    .update({ status: 'LOBBY', current_game_state: {}, state_version: room.state_version + 1, last_activity_at: new Date().toISOString() })
    .eq('room_id', room.room_id)
    .eq('state_version', room.state_version);
  if (error) return serverError(error.message);

  return ok({ ok: true });
};
