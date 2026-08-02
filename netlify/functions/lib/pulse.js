// The server half of the Realtime doorbell.
//
// WHY: every screen used to poll get-state on a timer, which is what burned
// 191,384 Netlify function invocations and got the site auto-paused (WORKLOG
// entry 19). Clients now sit on a Supabase Realtime subscription instead and
// only call a function when something has actually changed. This is the thing
// that tells them something changed.
//
// WHAT IT IS NOT: a way to ship game state to clients. room_pulse holds only
// "room X is now at version N, status S" — no hands, no piles, no tokens —
// because Realtime broadcasts the whole row to every subscriber and anyone can
// read that table with the publishable key. Clients take the nudge and then
// re-fetch through get-state, which checks their token and filters the view.
// If you ever find yourself wanting to add a column here, that is the signal
// that the data belongs in get-state instead.
const { getClient } = require('./supabase');

// Best-effort by design. A failed pulse must never fail the action that just
// succeeded: the write to `rooms` is the source of truth, and clients keep a
// slow safety-net poll precisely so a missed doorbell costs latency, not
// correctness. Swallow and log rather than throw.
// roomCode is carried so /tv, which is addressed by code rather than id, can
// filter its subscription without the public view having to expose room_id.
async function bumpPulse(roomId, stateVersion, status, roomCode) {
  try {
    const row = {
      room_id: roomId,
      state_version: stateVersion,
      status: status || 'LOBBY',
      updated_at: new Date().toISOString()
    };
    // Only write the code when the caller actually knows it, so a bump from a
    // path that lacks it cannot null out a good value.
    if (roomCode) row.room_code = roomCode;

    const { error } = await getClient()
      .from('room_pulse')
      .upsert(row, { onConflict: 'room_id' });
    if (error) console.error('[pulse] upsert failed', roomId, error.message);
  } catch (e) {
    console.error('[pulse] threw', roomId, e.message);
  }
}

// Lobby joins change what /host and /tv should show but do NOT bump
// rooms.state_version — the game state itself is untouched until Start. Without
// this, a player joining would not appear until the safety-net poll came round,
// which looks broken when four people are standing there tapping Join. Bumping
// updated_at alone is enough to fire a Realtime UPDATE.
async function pulseLobbyChange(roomId, stateVersion, roomCode) {
  return bumpPulse(roomId, stateVersion, 'LOBBY', roomCode);
}

module.exports = { bumpPulse, pulseLobbyChange };
