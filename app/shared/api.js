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
    getPublicState: (roomCode) => get('get-public-state', { code: roomCode }),
    getPlayerState: (roomId, playerId, token) => get('get-state', { roomId, actorType: 'player', playerId, token })
  };
})();

// localStorage-backed seat memory, so a phone/host refresh can reclaim its seat
// without re-joining (roadmap Phase 6, minimal version).
//
// Seats are stored as a LIST per room, not a single record. localStorage is
// per-origin, so two seats opened in one browser (testing both sides yourself)
// used to overwrite each other under one shared key and the first seat was
// silently lost. Each seat is now kept separately and chosen by playerId.
const Persist = {
  hostKey(roomId) { return 'salty-host-' + roomId; },
  playersKey(roomId) { return 'salty-players-' + roomId; },
  legacyPlayerKey(roomId) { return 'salty-player-' + roomId; },
  codeKey(roomId) { return 'salty-code-' + roomId; },

  saveHost(roomId, hostResumeToken) {
    localStorage.setItem('salty-last-room', roomId);
    localStorage.setItem(this.hostKey(roomId), hostResumeToken);
  },
  loadHost(roomId) { return localStorage.getItem(this.hostKey(roomId)); },

  // The room CODE, kept so /host can offer "rejoin ABCD" by name rather than
  // silently resuming (or worse, silently creating a second room on refresh).
  // roomId is a uuid nobody recognises; the code is the thing the host read out
  // to the table and may have written down.
  saveRoomCode(roomId, code) { if (code) localStorage.setItem(this.codeKey(roomId), code); },
  loadRoomCode(roomId) { return localStorage.getItem(this.codeKey(roomId)); },

  loadPlayers(roomId) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(this.playersKey(roomId))) || []; } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    // Carry across a seat saved under the old single-record key so existing
    // bookmarks and open sessions keep working after this change ships.
    if (!list.length) {
      try {
        const legacy = JSON.parse(localStorage.getItem(this.legacyPlayerKey(roomId)));
        if (legacy && legacy.playerId) list = [legacy];
      } catch (e) { /* ignore malformed legacy value */ }
    }
    return list;
  },
  savePlayer(roomId, playerId, resumeToken, seat, name) {
    localStorage.setItem('salty-last-room', roomId);
    const list = this.loadPlayers(roomId).filter(p => p.playerId !== playerId);
    list.push({ playerId, resumeToken, seat, name: name || null });
    list.sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
    localStorage.setItem(this.playersKey(roomId), JSON.stringify(list));
  },
  // playerId given -> that seat. Otherwise only auto-pick when there is exactly
  // one; with several saved the caller must ask which, or it would silently
  // resume as the wrong person.
  loadPlayer(roomId, playerId) {
    const list = this.loadPlayers(roomId);
    if (playerId) return list.find(p => p.playerId === playerId) || null;
    return list.length === 1 ? list[0] : null;
  },
  lastRoom() { return localStorage.getItem('salty-last-room'); }
};
