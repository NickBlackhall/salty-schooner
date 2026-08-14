const { getClient } = require('./supabase');

async function loadRoom(roomId) {
  const supabase = getClient();
  const { data, error } = await supabase.from('rooms').select('*').eq('room_id', roomId).single();
  if (error || !data) return null;
  return data;
}

async function loadRoomByCode(roomCode) {
  const supabase = getClient();
  const { data, error } = await supabase.from('rooms').select('*').eq('room_code', String(roomCode).trim().toUpperCase()).single();
  if (error || !data) return null;
  return data;
}

async function loadPlayers(roomId) {
  const supabase = getClient();
  const { data, error } = await supabase.from('players').select('*').eq('room_id', roomId).order('seat_number', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

function verifyHost(room, token) {
  return !!room && !!token && room.host_resume_token === token;
}

async function findPlayer(roomId, playerId) {
  const supabase = getClient();
  const { data, error } = await supabase.from('players').select('*').eq('room_id', roomId).eq('player_id', playerId).single();
  if (error || !data) return null;
  return data;
}

function verifyPlayer(player, token) {
  return !!player && !!token && player.resume_token === token;
}

module.exports = { loadRoom, loadRoomByCode, loadPlayers, verifyHost, findPlayer, verifyPlayer };
