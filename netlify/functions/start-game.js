const { getClient } = require('./lib/supabase');
const { ok, badRequest, notFound, unauthorized, conflict, serverError } = require('./lib/http');
const { loadRoom, loadPlayers, verifyHost } = require('./lib/access');
const { bumpPulse } = require('./lib/pulse');
const engine = require('./lib/engine');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  const room = await loadRoom(body.roomId);
  if (!room) return notFound('Room not found.');
  if (!verifyHost(room, body.hostResumeToken)) return unauthorized('Bad host token.');
  if (room.status !== 'LOBBY') return conflict('This game has already started.');

  const players = await loadPlayers(room.room_id);
  if (players.length < 2) return conflict('Need at least 2 players to start.');

  const names = players.map(p => p.player_name);
  const state = engine.createMatchState(names, room.config);
  engine.dealRound(state);

  const supabase = getClient();
  const { error } = await supabase
    .from('rooms')
    .update({ status: state.status, current_game_state: state, state_version: room.state_version + 1, last_activity_at: new Date().toISOString() })
    .eq('room_id', room.room_id)
    .eq('state_version', room.state_version);
  if (error) return serverError(error.message);

  // Start is the one bump every phone is waiting on — without it they sit on
  // the lobby screen until the safety-net poll fires.
  await bumpPulse(room.room_id, room.state_version + 1, state.status, room.room_code);

  return ok({ ok: true });
};
