const engine = require('./engine');

function publicPlayers(state) {
  return state.players.map((p, i) => ({
    seat: i,
    name: p.name,
    goalTop: engine.topCard(p.goal) || null,
    goalCount: p.goal.length,
    total: p.total,
    roundScore: p.roundScore
  }));
}

function jailbreakPublicView(state) {
  return {
    waitingCount: state.brig.length,
    waitingKings: state.brig,
    active: !!(state.jailbreak && state.jailbreak.active),
    releasedKings: state.jailbreak && state.jailbreak.active ? state.jailbreak.kings : [],
    lastOutcome: state.jailbreak ? state.jailbreak.lastOutcome || null : null
  };
}

function baseView(room, state) {
  const matchConfig = engine.activeMatchConfig(state);
  return {
    roomCode: room.room_code,
    status: room.status,
    stateVersion: room.state_version,
    round: state.round,
    maxRounds: matchConfig.rounds,
    holdCards: matchConfig.holdCards,
    currentSeat: state.currentPlayer,
    currentPlayerName: engine.currentPlayer(state).name,
    deckCount: state.deck.length,
    recycleCount: (state.recycle || []).length,
    runs: state.runs,
    brig: jailbreakPublicView(state),
    players: publicPlayers(state),
    pendingClinch: state.pendingClinch || null,
    endedEarly: !!state.endedEarly,
    log: state.log.slice(0, 8)
  };
}

function getHostView(room, state) {
  return baseView(room, state);
}

function getPlayerView(room, state, seat) {
  const view = baseView(room, state);
  const me = state.players[seat];
  view.yourSeat = seat;
  view.isYourTurn = state.status === 'IN_ROUND' && state.currentPlayer === seat;
  view.yourHand = me.hand;
  view.yourGoalTop = engine.topCard(me.goal) || null;
  view.yourGoalCount = me.goal.length;
  view.yourPorts = me.discards;
  // 0 means the draw control stays hidden. Non-zero is either the start-of-turn
  // quota or a full refill because the hand is empty — the phone phrases it.
  view.yourDrawCount = engine.drawEligibility(state, seat);
  return view;
}

function getLobbyView(room, players) {
  return {
    roomCode: room.room_code,
    status: room.status,
    config: room.config,
    players: players.map(p => ({ seat: p.seat_number, name: p.player_name, connected: p.connection_status === 'CONNECTED' }))
  };
}

module.exports = { getHostView, getPlayerView, getLobbyView };
