const { getClient } = require('./lib/supabase');
const { generateToken, clampMaxPlayers } = require('./lib/rooms');
const { ok, badRequest, notFound, conflict, serverError } = require('./lib/http');
const { loadPlayers } = require('./lib/access');
const { pulseLobbyChange } = require('./lib/pulse');
const { buildPublicSnapshot } = require('./lib/views');

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

  // Rejoin by name. A phone that lost its saved seat — cleared storage, private
  // tab, a different browser, a stray Back tap — used to be locked out for good
  // once the room left LOBBY, because /join refused both on room status and on
  // the duplicate name. Typing the same name now hands that seat's existing
  // credentials back instead.
  //
  // The tradeoff is deliberate: anyone who knows the room code AND a player's
  // display name can claim that seat. For a group in one room that is the same
  // trust level as being handed the code in the first place. Do not carry this
  // behaviour into a public/matchmade context without a real check.
  const existing = await loadPlayers(room.room_id);
  const mine = existing.find(p => p.player_name.toLowerCase() === playerName.toLowerCase());
  if (mine) {
    return ok({
      roomId: room.room_id,
      roomCode: room.room_code,
      playerId: mine.player_id,
      seat: mine.seat_number,
      resumeToken: mine.resume_token,
      rejoined: true
    });
  }

  // Past this point we are seating someone new, which only makes sense before
  // the deal — mid-game there is no hand for them.
  if (room.status !== 'LOBBY') return conflict('This game has already started, so you can only rejoin with the exact name you used before.');

  const resumeToken = generateToken();
  // Per-room setting now (set at create-room time), not a global constant.
  // Fallback covers rooms created before this field existed.
  const maxPlayers = clampMaxPlayers(room.config && room.config.maxPlayers);

  // Seat assignment races when two phones tap Join at nearly the same instant: both can
  // read the same player count before either insert lands. Retry on the seat's unique
  // constraint instead of trusting a single read-then-write.
  for (let attempt = 0; attempt < maxPlayers + 2; attempt++) {
    const players = await loadPlayers(room.room_id);
    if (players.length >= maxPlayers) return conflict('This room is full.');
    const raced = players.find(p => p.player_name.toLowerCase() === playerName.toLowerCase());
    if (raced) {
      // Someone with this name landed between our check and this attempt — treat
      // it as a rejoin rather than rejecting them.
      return ok({ roomId: room.room_id, roomCode: room.room_code, playerId: raced.player_id, seat: raced.seat_number, resumeToken: raced.resume_token, rejoined: true });
    }
    const seat = players.length;
    const { data: player, error } = await supabase
      .from('players')
      .insert({ room_id: room.room_id, player_name: playerName, seat_number: seat, resume_token: resumeToken })
      .select('player_id')
      .single();
    if (!error) {
      // A new seat changes the lobby roster on /host and /tv, but nothing here
      // touches rooms.state_version — the game state is untouched until Start.
      // Ring the doorbell explicitly, or four people tapping Join would appear
      // only when the safety-net poll next fired.
      // `players` is the read from the TOP of this loop iteration, so it does
      // not include the row just inserted — append it by hand rather than
      // re-querying. connection_status defaults to CONNECTED on insert.
      const freshPlayers = [...players, { seat_number: seat, player_name: playerName, connection_status: 'CONNECTED' }];
      await pulseLobbyChange(room.room_id, room.state_version, room.room_code,
        buildPublicSnapshot(room, {}, freshPlayers));
      return ok({ roomId: room.room_id, roomCode: room.room_code, playerId: player.player_id, seat, resumeToken, rejoined: false });
    }
    if (error.code !== '23505') return serverError(error.message);
    // else: seat was taken between our read and write — loop and try the next one.
  }
  return conflict('Could not claim a seat, please try joining again.');
};
