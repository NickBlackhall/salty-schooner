const { getClient } = require('./lib/supabase');
const { ok, badRequest, notFound, unauthorized, conflict, serverError } = require('./lib/http');
const { loadRoom, findPlayer, verifyHost, verifyPlayer } = require('./lib/access');
const { getHostView, getPlayerView } = require('./lib/views');
const { bumpPulse } = require('./lib/pulse');
const engine = require('./lib/engine');

const PLAYER_ACTIONS = new Set(['PLAY_CARD', 'DRAW_HAND', 'DISCARD_TO_PORT']);
const HOST_ACTIONS = new Set(['ADVANCE_ROUND']);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  const { roomId, actorType, token, playerId, action, expectedVersion } = body;
  if (!roomId || !actorType || !token || !action || !action.type) return badRequest('Missing required fields.');

  // Both reads are issued together: they hit different tables and neither uses
  // the other's result, but running them in sequence put two full DB
  // round-trips on the critical path of every play. The player read is started
  // before the room is known to be valid, which costs one wasted SELECT on the
  // error paths below and saves a round-trip on every successful action — the
  // overwhelmingly common case. Validation order and every response are
  // unchanged; only the waiting overlaps.
  const [room, player] = await Promise.all([
    loadRoom(roomId),
    actorType === 'player' ? findPlayer(roomId, playerId) : Promise.resolve(null)
  ]);
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

  // Ring the doorbell only after the authoritative write has landed, so nobody
  // is ever told to fetch a version that does not exist yet. Awaited rather
  // than fired-and-forgotten because the Lambda can freeze the moment the
  // response returns, which would drop an un-awaited write on the floor.
  await bumpPulse(roomId, newVersion, state.status, room.room_code);

  const freshRoom = { ...room, status: state.status, state_version: newVersion };
  const view = actorType === 'host' ? getHostView(freshRoom, state) : getPlayerView(freshRoom, state, seat);
  return ok({ events, view });
};
