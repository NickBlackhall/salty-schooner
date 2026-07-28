// Thin fetch wrapper for the Netlify Functions backing the multiplayer prototype.
// Shared by host.html and play.html.
const Api = (() => {
  async function call(path, options = {}) {
    const res = await fetch('/api/' + path, options);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || ('Request failed: ' + res.status));
      err.status = res.status;
      throw err;
    }
    return body;
  }
  function post(path, payload) {
    return call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
  function get(path, params) {
    const qs = new URLSearchParams(params).toString();
    return call(path + '?' + qs, { method: 'GET' });
  }

  return {
    createRoom: (config) => post('create-room', config),
    joinRoom: (roomCode, playerName) => post('join-room', { roomCode, playerName }),
    startGame: (roomId, hostResumeToken) => post('start-game', { roomId, hostResumeToken }),
    resetGame: (roomId, hostResumeToken) => post('reset-game', { roomId, hostResumeToken }),
    submitAction: (payload) => post('submit-action', payload),
    getHostState: (roomId, token) => get('get-state', { roomId, actorType: 'host', token }),
    getPlayerState: (roomId, playerId, token) => get('get-state', { roomId, actorType: 'player', playerId, token })
  };
})();

// localStorage-backed seat memory, so a phone/host refresh can reclaim its seat
// without re-joining (roadmap Phase 6, minimal version).
const Persist = {
  hostKey(roomId) { return 'salty-host-' + roomId; },
  playerKey(roomId) { return 'salty-player-' + roomId; },
  saveHost(roomId, hostResumeToken) {
    localStorage.setItem('salty-last-room', roomId);
    localStorage.setItem(this.hostKey(roomId), hostResumeToken);
  },
  loadHost(roomId) { return localStorage.getItem(this.hostKey(roomId)); },
  savePlayer(roomId, playerId, resumeToken, seat) {
    localStorage.setItem('salty-last-room', roomId);
    localStorage.setItem(this.playerKey(roomId), JSON.stringify({ playerId, resumeToken, seat }));
  },
  loadPlayer(roomId) {
    const raw = localStorage.getItem(this.playerKey(roomId));
    return raw ? JSON.parse(raw) : null;
  },
  lastRoom() { return localStorage.getItem('salty-last-room'); }
};
