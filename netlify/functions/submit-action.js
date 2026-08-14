const { getClient } = require('./lib/supabase');
const { ok, badRequest, notFound, unauthorized, conflict, serverError } = require('./lib/http');
const { loadRoom, findPlayer, verifyHost, verifyPlayer } = require('./lib/access');
const { getPlayerView, buildPublicSnapshot } = require('./lib/views');
const { bumpPulse } = require('./lib/pulse');
const engine = require('./lib/engine');

const PLAYER_ACTIONS = new Set(['PLAY_CARD', 'DRAW_HAND', 'DISCARD_TO_PORT']);
const HOST_ACTIONS = new Set(['ADVANCE_ROUND']);

// Server-side stage timing. The phone can only see one number — the whole round
// trip — which on a real phone measured 382ms median and over a second at the
// tail, with no way to tell transit from function start-up from database work.
// These are DURATIONS measured entirely with the server's own clock and returned
// as durations, never as timestamps: client and server clocks are unrelated, and
// differencing across them produces a number that looks precise and is not.
// The client subtracts the reported total from its own round trip to get
// everything OUTSIDE the function (transit plus cold start).
function stopwatch() {
  const t0 = process.hrtime.bigint();
  let last = t0;
  const stages = {};
  return {
    mark(name) {
      const now = process.hrtime.bigint();
      stages[name] = Number(now - last) / 1e6;
      last = now;
    },
    done() {
      stages.total = Number(process.hrtime.bigint() - t0) / 1e6;
      for (const k of Object.keys(stages)) stages[k] = Math.round(stages[k] * 10) / 10;
      return stages;
    }
  };
}

exports.handler = async (event) => {
  const clock = stopwatch();
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  // Echoed back so a timing row on the phone can be tied to the exact action it
  // belongs to rather than to whatever was in flight when the response landed.
  // NOT used for de-duplication: that is the compare-and-swap below, which
  // already refuses a replayed request carrying a stale version.
  const { roomId, actorType, token, playerId, action, expectedVersion, clientActionId } = body;
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
  clock.mark("reads");
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

  clock.mark("auth");
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

  clock.mark("rules");
  const supabase = getClient();
  const newVersion = room.state_version + 1;
  const { data: updated, error } = await supabase
    .from('rooms')
    .update({ status: state.status, current_game_state: state, state_version: newVersion, last_activity_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('state_version', room.state_version)
    .select('room_id')
    .single();
  clock.mark("write");
  if (error || !updated) return conflict('Someone else already acted — refresh and try again.');

  const freshRoom = { ...room, status: state.status, state_version: newVersion };
  // An action never lands the room in LOBBY (that is reset-game's job), so this
  // is always the getHostView branch of buildPublicSnapshot — but calling the
  // shared function rather than getHostView directly means a future status this
  // file does not expect degrades to a lobby snapshot instead of throwing.
  const publicSnapshot = buildPublicSnapshot(freshRoom, state, null);

  // Ring the doorbell only after the authoritative write has landed, so nobody
  // is ever told to fetch a version that does not exist yet. Awaited rather
  // than fired-and-forgotten because the Lambda can freeze the moment the
  // response returns, which would drop an un-awaited write on the floor.
  await bumpPulse(roomId, newVersion, state.status, room.room_code, publicSnapshot);

  clock.mark("pulse");
  const view = actorType === 'host' ? publicSnapshot : getPlayerView(freshRoom, state, seat);
  clock.mark("view");
  return ok({ events, view, timing: clock.done(), actionId: clientActionId || null });
};
