const { getClient } = require('./lib/supabase');
const { ok, badRequest, notFound, unauthorized, conflict, serverError } = require('./lib/http');
const { loadRoom, findPlayer, verifyHost, verifyPlayer } = require('./lib/access');
const { getHostView, getPlayerView } = require('./lib/views');
const engine = require('./lib/engine');

const PLAYER_ACTIONS = new Set(['PLAY_CARD', 'DRAW_HAND', 'DISCARD_TO_PORT']);
const HOST_ACTIONS = new Set(['ADVANCE_ROUND']);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  const { roomId, actorType, token, playerId, action, expectedVersion } = body;
  if (!roomId || !actorType || !token || !action || !action.type) return badRequest('Missing required fields.');

  const room = await loadRoom(roomId);
  if (!room) return notFound('Room not found.');
  if (room.status !== 'IN_ROUND' && room.status !== 'ROUND_RESULTS') return conflict('This room has no game in progress.');
  if (typeof expectedVersion !== 'number' || expectedVersion !== room.state_version) {
    return conflict('Someone else already acted — refresh and try again.');
  }

  let seat = null;
  if (actorType === 'host') {
    if (!verifyHost(room, token)) return unauthorized('Bad host token.');
    if (!HOST_ACTIONS.has(action.type)) return badRequest('Not a host action.');
  } else if (actorType === 'player') {
    const player = await findPlayer(roomId, playerId);
    if (!verifyPlayer(player, token)) return unauthorized('Bad player token.');
    if (!PLAYER_ACTIONS.has(action.type)) return badRequest('Not a player action.');
    seat = player.seat_number;
  } else {
    return badRequest('Unknown actorType.');
  }

  const state = room.current_game_state;
  let events;
  try {
    if (action.type === 'PLAY_CARD') {
      events = engine.applyPlayCard(state, { playerIndex: seat, cardId: action.cardId, runIndex: action.runIndex, kingChoice: action.kingChoice });
    } else if (action.type === 'DRAW_HAND') {
      events = engine.applyDrawHand(state, { playerIndex: seat });
    } else if (action.type === 'DISCARD_TO_PORT') {
      events = engine.applyDiscardToPort(state, { playerIndex: seat, cardId: action.cardId, portIndex: action.portIndex });
    } else if (action.type === 'ADVANCE_ROUND') {
      events = engine.advanceRound(state, { endNow: !!action.endNow });
    }
  } catch (e) {
    if (e instanceof engine.RuleError) return badRequest(e.message);
    return serverError(e.message);
  }

  const supabase = getClient();
  const newVersion = room.state_version + 1;
  const { data: updated, error } = await supabase
    .from('rooms')
    .update({ status: state.status, current_game_state: state, state_version: newVersion, last_activity_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('state_version', room.state_version)
    .select('room_id')
    .single();
  if (error || !updated) return conflict('Someone else already acted — refresh and try again.');

  const freshRoom = { ...room, status: state.status, state_version: newVersion };
  const view = actorType === 'host' ? getHostView(freshRoom, state) : getPlayerView(freshRoom, state, seat);
  return ok({ events, view });
};
