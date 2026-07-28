const { getClient } = require('./lib/supabase');
const { generateToken } = require('./lib/rooms');
const { ok, badRequest, notFound, conflict, serverError } = require('./lib/http');
const { loadPlayers } = require('./lib/access');

const MAX_PLAYERS = 6;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return badRequest('POST only');
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return badRequest('Invalid JSON body.'); }

  const roomCode = String(body.roomCode || '').trim().toUpperCase();
  const playerName = String(body.playerName || '').trim().slice(0, 24);
  if (!roomCode) return badRequest('roomCode is required.');
  if (!playerName) return badRequest('playerName is required.');

  const supabase = getClient();
  const { data: room, error: roomErr } = await supabase.from('rooms').select('*').eq('room_code', roomCode).single();
  if (roomErr || !room) return notFound('No room with that code.');
  if (room.status !== 'LOBBY') return conflict('This room has already started.');

  const resumeToken = generateToken();

  // Seat assignment races when two phones tap Join at nearly the same instant: both can
  // read the same player count before either insert lands. Retry on the seat's unique
  // constraint instead of trusting a single read-then-write.
  for (let attempt = 0; attempt < MAX_PLAYERS + 2; attempt++) {
    const players = await loadPlayers(room.room_id);
    if (players.length >= MAX_PLAYERS) return conflict('This room is full.');
    if (players.some(p => p.player_name.toLowerCase() === playerName.toLowerCase())) {
      return conflict('Someone already joined with that name — pick another.');
    }
    const seat = players.length;
    const { data: player, error } = await supabase
      .from('players')
      .insert({ room_id: room.room_id, player_name: playerName, seat_number: seat, resume_token: resumeToken })
      .select('player_id')
      .single();
    if (!error) {
      return ok({ roomId: room.room_id, roomCode: room.room_code, playerId: player.player_id, seat, resumeToken });
    }
    if (error.code !== '23505') return serverError(error.message);
    // else: seat was taken between our read and write — loop and try the next one.
  }
  return conflict('Could not claim a seat, please try joining again.');
};
