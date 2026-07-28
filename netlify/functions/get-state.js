const { badRequest, notFound, unauthorized } = require('./lib/http');
const { loadRoom, loadPlayers, findPlayer, verifyHost, verifyPlayer } = require('./lib/access');
const { getHostView, getPlayerView, getLobbyView } = require('./lib/views');

function ok(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const { roomId, actorType, token, playerId } = q;
  if (!roomId || !actorType || !token) return badRequest('Missing required query params.');

  const room = await loadRoom(roomId);
  if (!room) return notFound('Room not found.');

  let seat = null;
  if (actorType === 'host') {
    if (!verifyHost(room, token)) return unauthorized('Bad host token.');
  } else if (actorType === 'player') {
    const player = await findPlayer(roomId, playerId);
    if (!verifyPlayer(player, token)) return unauthorized('Bad player token.');
    seat = player.seat_number;
  } else {
    return badRequest('Unknown actorType.');
  }

  if (room.status === 'LOBBY') {
    const players = await loadPlayers(roomId);
    return ok(getLobbyView(room, players));
  }

  const state = room.current_game_state;
  const view = actorType === 'host' ? getHostView(room, state) : getPlayerView(room, state, seat);
  return ok(view);
};
