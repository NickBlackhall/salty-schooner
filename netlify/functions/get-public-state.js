const { badRequest, notFound } = require('./lib/http');
const { loadRoomByCode, loadPlayers } = require('./lib/access');
const { getHostView, getLobbyView } = require('./lib/views');

// Unauthenticated read of a room's PUBLIC board, addressed by room code, for a
// TV or any other shared display. Deliberately has no token: the display is
// meant to be looked at by everyone in the room, and getHostView() already
// contains only public information — face-up HOLD tops, counts, runs, the
// Brig, scores and the log. No hands, no Ports. Never widen this to
// getPlayerView(); that is the one thing that would leak private cards to an
// endpoint anybody can call.
function ok(body) {
  return {
    statusCode: 200,
    // Public board state, but still per-room and changing every turn — let the
    // browser revalidate rather than serve a cached board.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  const code = (event.queryStringParameters || {}).code;
  if (!code) return badRequest('A room code is required.');

  const room = await loadRoomByCode(code);
  if (!room) return notFound('No room with that code.');

  if (room.status === 'LOBBY') {
    const players = await loadPlayers(room.room_id);
    return ok(getLobbyView(room, players));
  }
  return ok(getHostView(room, room.current_game_state));
};
