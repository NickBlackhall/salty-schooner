// Salty Schooner rules engine.
//
// THE RULES LIVE IN docs/RULES.md — that document is authoritative, not this
// file and not app/index.html. If this code and that document disagree, this
// code is wrong. Never change a rule here without an approved change recorded
// in the RULES.md change log (§13).
//
// Originally ported from app/index.html (v26 · build 16) with every DOM/render/
// audio/modal call stripped out, and every modal-driven choice (King direction
// and value) turned into an explicit action parameter. app/index.html is now
// FROZEN at v26.16 and deliberately differs on hand refill — do not resync to it.
//
// Every function here is pure/state-in-state-out. No DOM, no globals besides `uid`.
//
// Every function here is pure/state-in-state-out. No DOM, no globals besides `uid`.

const VALUES = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13 };
const VALUE_NAMES = {1:'A',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K'};
const SUITS = ['♠','♥','♦','♣'];
const RED = new Set(['♥','♦']);
const MATCH_LIMITS = Object.freeze({
  holdCards: {min:5, max:20, defaultValue:10},
  rounds: {min:1, max:10, defaultValue:4}
});

let uid = 1;

function clampMatchNumber(value, limits) {
  const parsed = Number.parseInt(value, 10);
  const safe = Number.isFinite(parsed) ? parsed : limits.defaultValue;
  return Math.min(limits.max, Math.max(limits.min, safe));
}
function normalizeMatchConfig(config = {}) {
  return {
    holdCards: clampMatchNumber(config.holdCards, MATCH_LIMITS.holdCards),
    rounds: clampMatchNumber(config.rounds, MATCH_LIMITS.rounds)
  };
}
function activeMatchConfig(state) {
  return normalizeMatchConfig(state && state.matchConfig ? state.matchConfig : {});
}

function createMatchState(names, requestedConfig = {}) {
  const matchConfig = normalizeMatchConfig(requestedConfig);
  return {
    players: names.map(name => ({ name, total: 0, roundScore: 0, goal: [], hand: [], discards: [[], [], [], []] })),
    matchConfig,
    round: 1,
    currentPlayer: 0,
    deck: [], runs: [], brig: [], recycle: [],
    jailbreak: { active: false, kings: [], initialCount: 0 },
    stalls: [], pendingWinner: null, handEmptyNoted: false, drawQuota: 0, log: [],
    version: 'v26-configurable-match',
    status: 'IN_ROUND',
    endedEarly: false,
    winner: null
  };
}

function makeDeck(playerCount) {
  const deck = [];
  for (let d = 0; d < playerCount; d++) {
    for (const suit of SUITS) {
      for (const rank of Object.keys(VALUES)) {
        deck.push({ id: 'c' + (uid++), rank, suit, value: VALUES[rank] });
      }
    }
  }
  return shuffle(deck);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function cardLabel(card) { return card ? card.rank + card.suit : ''; }
function topCard(arr) { return arr[arr.length - 1]; }

function log(state, msg) { state.log.unshift(msg); }

function drawCard(state) {
  if (!Array.isArray(state.recycle)) state.recycle = [];
  if (state.deck.length === 0 && state.recycle.length > 0) {
    const recycledCount = state.recycle.length;
    state.deck = shuffle(state.recycle);
    state.recycle = [];
    log(state, `The draw deck was empty. ${recycledCount} cleared-run card${recycledCount === 1 ? ' was' : 's were'} shuffled into a new draw deck.`);
  }
  if (state.deck.length === 0) return null;
  return state.deck.pop();
}
// Draw exactly n cards (not "fill up to n"). The distinction matters for the
// start-of-turn top-off: a quota of 1 draws one card even if the hand has since
// shrunk to 3, so it lands on 4 rather than refilling to 5.
function drawN(state, player, n) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const card = drawCard(state);
    if (!card) break;
    player.hand.push(card);
    drawn++;
  }
  if (drawn > 0) state.handEmptyNoted = false;
  return drawn;
}
function currentPlayer(state) { return state.players[state.currentPlayer]; }

const HAND_LIMIT = 5;

// ---- Hand refill (rule change, 2026-07-29, approved by Nick Blackhall) -------
//
// WAS: every turn ended with an unconditional refill to 5. Two problems showed
// up in play. First, scoring is HOLD + hand, so every player who did not win the
// round scored their HOLD plus exactly 5 — a flat penalty they never chose, and
// a scoring term that was constant for everyone but the winner. Second, drawing
// at the END of a turn claims cards out of the shared deck that then sit dead in
// that player's hand through everyone else's turns.
//
// NOW: nothing is drawn automatically. A player may draw when either holds:
//
//   1. Start-of-turn quota — HAND_LIMIT minus the hand size at the moment the
//      turn began, computed once in beginTurn() and never recalculated. Spending
//      it is optional and can happen at any point in the turn, but playing cards
//      first does not enlarge it: start with 4, play one, and the quota is still
//      1, landing on 4 — not 5.
//   2. Empty hand — any time the hand hits exactly 0, mid-turn, draw up to 5.
//      Repeatable, since a long turn can empty the hand more than once.
//
// Where both could apply the empty-hand draw wins (up to 5 beats any leftover
// quota) and the quota is cleared, so there is no double-dip.
//
// This is the same principle as the build-14 note in app/index.html — "refilling
// mid-turn is the player's call" — extended to close the turn-end loophole that
// reintroduced the forced refill.
//
// NOTE: app/index.html (hot-seat) still has the old turn-end refill. The two
// builds now differ on this rule deliberately; do not "fix" one to match the
// other without checking which behaviour is wanted.
function beginTurn(state) {
  state.drawQuota = Math.max(0, HAND_LIMIT - currentPlayer(state).hand.length);
}

// How many cards the seat may draw right now: 0 hides the draw control.
function drawEligibility(state, seat) {
  if (state.status !== 'IN_ROUND' || state.currentPlayer !== seat) return 0;
  const p = state.players[seat];
  if (!p) return 0;
  if (p.hand.length === 0) return HAND_LIMIT;
  return state.drawQuota || 0;
}

function runLastValue(run) {
  const c = topCard(run.cards);
  if (!c) return null;
  return c.effectiveValue || c.value;
}
function nextValuesForRun(run) {
  if (run.cards.length === 0) return [{ value: 1, dir: 'up' }, { value: 12, dir: 'down' }];
  const last = runLastValue(run);
  const vals = [];
  if (!run.direction) {
    if (last < 12) vals.push({ value: last + 1, dir: 'up' });
    if (last > 1) vals.push({ value: last - 1, dir: 'down' });
  } else if (run.direction === 'up') {
    if (last < 12) vals.push({ value: last + 1, dir: 'up' });
  } else if (run.direction === 'down') {
    if (last > 1) vals.push({ value: last - 1, dir: 'down' });
  }
  return vals;
}
function kingRequiredValue(run) {
  if (!run || run.cards.length === 0 || !run.direction) return null;
  const last = runLastValue(run);
  const required = run.direction === 'up' ? last + 1 : last - 1;
  return required >= 2 && required <= 11 ? required : null;
}
function unsetNaturalKingChoices(run) {
  if (!run || run.direction || run.cards.length !== 1) return [];
  const natural = run.cards[0];
  if (!natural || natural.rank === 'K') return [];
  const choices = [];
  const lower = natural.value - 1;
  const higher = natural.value + 1;
  if (lower >= 2 && lower <= 11) choices.push({ kingValue: lower, dir: 'down' });
  if (higher >= 2 && higher <= 11) choices.push({ kingValue: higher, dir: 'up' });
  return choices;
}
function canPlayCardOnRun(card, run) {
  if (!card) return false;
  if (card.rank === 'K') {
    if (run.cards.length === 0) return false;
    const last = topCard(run.cards);
    if (last && last.rank === 'K') return false;
    if (!run.direction) return unsetNaturalKingChoices(run).length > 0;
    return kingRequiredValue(run) !== null;
  }
  if (run.cards.length === 0) return card.value === 1 || card.value === 12;
  return nextValuesForRun(run).some(n => n.value === card.value);
}
function checkComplete(state, runIndex) {
  const run = state.runs[runIndex];
  const last = topCard(run.cards);
  if (!last || last.rank === 'K') return;
  if (!((run.direction === 'up' && last.value === 12) || (run.direction === 'down' && last.value === 1))) return;
  const kings = run.cards.filter(c => c.rank === 'K');
  const recyclable = run.cards.filter(c => c.rank !== 'K');
  if (!Array.isArray(state.recycle)) state.recycle = [];
  state.recycle.push(...recyclable);
  if (kings.length) {
    state.brig.push(...kings.map(c => ({ ...c, effectiveValue: null, playedDirection: null })));
    log(state, `Run ${runIndex + 1} reached safe harbor. ${kings.length} King${kings.length > 1 ? 's' : ''} sent to The Brig and ${recyclable.length} non-King card${recyclable.length === 1 ? '' : 's'} moved to the recycle pile.`);
  } else {
    log(state, `Run ${runIndex + 1} reached safe harbor. ${recyclable.length} card${recyclable.length === 1 ? '' : 's'} moved to the recycle pile.`);
  }
  state.runs[runIndex] = { cards: [], direction: null };
}

function dealRound(state) {
  uid = uid + 1000;
  state.deck = makeDeck(state.players.length);
  state.brig = [];
  state.recycle = [];
  state.jailbreak = { active: false, kings: [], initialCount: 0 };
  state.pendingWinner = null;
  if (!Array.isArray(state.stalls)) state.stalls = [];
  const kIndex = state.deck.findIndex(c => c.rank === 'K');
  if (kIndex >= 0) state.brig.push(state.deck.splice(kIndex, 1)[0]);
  state.deck = shuffle(state.deck);
  state.runs = Array.from({ length: 4 }, () => ({ cards: [], direction: null }));
  const matchConfig = activeMatchConfig(state);
  state.players.forEach(p => {
    p.goal = [];
    p.hand = [];
    p.discards = [[], [], [], []];
    for (let i = 0; i < matchConfig.holdCards; i++) p.goal.push(drawCard(state));
    for (let i = 0; i < 5; i++) p.hand.push(drawCard(state));
  });
  let opener = drawCard(state);
  while (opener && opener.rank === 'K') {
    state.deck.push(opener);
    state.deck = shuffle(state.deck);
    opener = drawCard(state);
  }
  if (opener) {
    state.runs[0].cards.push(opener);
    if (opener.value === 1) state.runs[0].direction = 'up';
    if (opener.value === 12) state.runs[0].direction = 'down';
  }
  state.currentPlayer = (state.round - 1) % state.players.length;
  state.status = 'IN_ROUND';
  // Everyone was just dealt a full hand, so the opening quota works out to 0 —
  // no special case needed, the formula covers it.
  beginTurn(state);
  const starter = currentPlayer(state);
  log(state, `Round ${state.round} started. ${starter.name} goes first. The Brig begins with 1 King.`);
}

function clinchedPlayer(state, remainingRounds) {
  if (remainingRounds < 1) return null;
  const maxPerRound = activeMatchConfig(state).holdCards + 5;
  for (const L of state.players) {
    const lWorst = L.total + remainingRounds * maxPerRound;
    const clinched = state.players.every(O => O === L || lWorst < O.total);
    if (clinched) return L;
  }
  return null;
}

function endRound(state, winner, events) {
  state.players.forEach(p => {
    p.roundScore = p.goal.length + p.hand.length;
    p.total += p.roundScore;
  });
  const rounds = activeMatchConfig(state).rounds;
  if (state.round >= rounds) {
    state.status = 'GAME_RESULTS';
    events.push({ type: 'GAME_OVER' });
    return;
  }
  const remaining = rounds - state.round;
  const clinch = clinchedPlayer(state, remaining);
  state.status = 'ROUND_RESULTS';
  state.pendingClinch = clinch ? clinch.name : null;
  events.push({ type: 'ROUND_OVER', winner: winner.name, clinched: clinch ? clinch.name : null });
}

// Host-only: called after ROUND_RESULTS to move on, or after a clinch to end early.
function advanceRound(state, { endNow } = {}) {
  const events = [];
  if (state.status !== 'ROUND_RESULTS') throw new RuleError('No round result is pending.');
  if (endNow && state.pendingClinch) {
    state.endedEarly = true;
    state.status = 'GAME_RESULTS';
    events.push({ type: 'GAME_OVER' });
    return events;
  }
  state.round++;
  state.pendingClinch = null;
  dealRound(state);
  events.push({ type: 'ROUND_STARTED', round: state.round });
  return events;
}

function turnSnapshot(state) {
  return {
    hold: state.players.map(p => p.goal.length),
    emptyRuns: state.runs.filter(r => r.cards.length === 0).length,
    brig: state.brig.length + ((state.jailbreak && state.jailbreak.active) ? state.jailbreak.kings.length : 0)
  };
}
function nextTurn(state) {
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  beginTurn(state);
}

class RuleError extends Error {}

function findCardZone(player, jailbreak, cardId) {
  let idx = player.hand.findIndex(c => c.id === cardId);
  if (idx >= 0) return { zone: 'hand', index: idx };
  if (topCard(player.goal) && topCard(player.goal).id === cardId) return { zone: 'goal', index: player.goal.length - 1 };
  for (let i = 0; i < player.discards.length; i++) {
    const pile = player.discards[i];
    if (topCard(pile) && topCard(pile).id === cardId) return { zone: 'discard', index: i };
  }
  if (jailbreak && jailbreak.active) {
    const jIdx = jailbreak.kings.findIndex(c => c.id === cardId);
    if (jIdx >= 0) return { zone: 'jailbreak', index: jIdx };
  }
  return null;
}
function getCardAt(state, player, loc) {
  if (loc.zone === 'goal') return topCard(player.goal);
  if (loc.zone === 'hand') return player.hand[loc.index];
  if (loc.zone === 'discard') return topCard(player.discards[loc.index]);
  if (loc.zone === 'jailbreak') return state.jailbreak.kings[loc.index];
  return null;
}
function removeCardAt(state, player, loc) {
  if (loc.zone === 'goal') return player.goal.pop();
  if (loc.zone === 'hand') return player.hand.splice(loc.index, 1)[0];
  if (loc.zone === 'discard') return player.discards[loc.index].pop();
  if (loc.zone === 'jailbreak') return state.jailbreak.kings.splice(loc.index, 1)[0];
}

// action: { type:'PLAY_CARD', playerIndex, cardId, runIndex, kingChoice?: {value, dir} }
function applyPlayCard(state, action) {
  const events = [];
  if (state.status !== 'IN_ROUND') throw new RuleError('No round is in progress.');
  if (action.playerIndex !== state.currentPlayer) throw new RuleError('It is not your turn.');
  const p = currentPlayer(state);
  const loc = findCardZone(p, state.jailbreak, action.cardId);
  if (!loc) throw new RuleError('Card not found in your hand, HOLD, Port, or released Jailbreak Kings.');
  const card = getCardAt(state, p, loc);
  const run = state.runs[action.runIndex];
  if (!run) throw new RuleError('Invalid run.');
  if (!canPlayCardOnRun(card, run)) throw new RuleError('Illegal play.');

  if (card.rank === 'K') {
    const sourceWasReleasedKing = loc.zone === 'jailbreak';
    const previousRunHadKing = run.cards.some(c => c.rank === 'K');
    let value, dir;
    if (!run.direction) {
      const choices = unsetNaturalKingChoices(run);
      const pick = action.kingChoice && choices.find(c => c.kingValue === action.kingChoice.value && c.dir === action.kingChoice.dir);
      if (!pick) throw new RuleError('This King needs a value/direction choice.');
      value = pick.kingValue; dir = pick.dir;
    } else {
      const required = kingRequiredValue(run);
      if (required === null) throw new RuleError('This run only takes a natural Ace or Queen next.');
      if (!action.kingChoice || action.kingChoice.value !== required || !['up', 'down'].includes(action.kingChoice.dir)) {
        throw new RuleError('This King needs a direction choice.');
      }
      value = required; dir = action.kingChoice.dir;
    }
    const king = removeCardAt(state, p, loc);
    king.effectiveValue = value;
    king.playedDirection = dir;
    run.cards.push(king);
    run.direction = dir;
    log(state, `${p.name} played ${cardLabel(king)} as ${VALUE_NAMES[value]} and chose ${dir.toUpperCase()} on Run ${action.runIndex + 1}.`);
    events.push({ type: 'CARD_PLAYED', card: cardLabel(king) });

    const triggersJailbreak = !sourceWasReleasedKing && state.brig.length > 0 && !previousRunHadKing && !(state.jailbreak && state.jailbreak.active);
    if (triggersJailbreak) {
      const released = state.brig.map(c => ({ ...c, effectiveValue: null, playedDirection: null }));
      state.brig = [];
      state.jailbreak = { active: true, kings: released, initialCount: released.length };
      log(state, `${p.name} triggered a Jailbreak with ${cardLabel(king)}. ${released.length} Brig King${released.length === 1 ? ' was' : 's were'} released for this turn.`);
      events.push({ type: 'JAILBREAK_TRIGGERED', count: released.length });
      return events;
    }
  } else {
    const nexts = nextValuesForRun(run).filter(n => n.value === card.value);
    const c = removeCardAt(state, p, loc);
    if (!run.direction && run.cards.length > 0) run.direction = nexts[0].dir;
    if (run.cards.length === 0) {
      if (c.value === 1) run.direction = 'up';
      if (c.value === 12) run.direction = 'down';
    }
    run.cards.push(c);
    log(state, `${p.name} played ${cardLabel(c)} to Run ${action.runIndex + 1}.`);
    events.push({ type: 'CARD_PLAYED', card: cardLabel(c) });
  }
  checkComplete(state, action.runIndex);
  runAfterPlay(state, events);
  return events;
}

function runAfterPlay(state, events) {
  const p = currentPlayer(state);
  const jailbreakActive = state.jailbreak && state.jailbreak.active;
  const releasedKingsRemain = jailbreakActive && state.jailbreak.kings.length > 0;
  if (jailbreakActive && !releasedKingsRemain) {
    const count = state.jailbreak.initialCount || 0;
    state.jailbreak = { active: false, kings: [], initialCount: 0, lastOutcome: 'success' };
    log(state, `${p.name} played every released Brig King. The Jailbreak is complete.`);
    events.push({ type: 'JAILBREAK_SUCCESS', count });
    return;
  }
  if (p.goal.length === 0) {
    if (!jailbreakActive || !releasedKingsRemain) {
      state.pendingWinner = null;
      endRound(state, p, events);
      return;
    }
    state.pendingWinner = state.currentPlayer;
    log(state, `${p.name} cleared their goal pile, but must finish the active Jailbreak before winning the round.`);
  }
  if (p.hand.length === 0 && !state.handEmptyNoted) {
    state.handEmptyNoted = true;
    log(state, `${p.name} played through their hand — draw when you're ready, or finish empty.`);
  }
}

// action: { type:'DRAW_HAND', playerIndex }
function applyDrawHand(state, action) {
  if (state.status !== 'IN_ROUND') throw new RuleError('No round is in progress.');
  if (action.playerIndex !== state.currentPlayer) throw new RuleError('It is not your turn.');
  const p = currentPlayer(state);

  // Empty hand outranks the start-of-turn quota — up to 5 beats whatever is
  // left of it — so the quota is consumed rather than granted on top.
  const emptyHand = p.hand.length === 0;
  const want = emptyHand ? HAND_LIMIT : (state.drawQuota || 0);
  if (want <= 0) throw new RuleError('You have no cards to draw right now.');

  const drawn = drawN(state, p, want);
  state.drawQuota = 0;

  const events = [];
  if (drawn === 0) {
    log(state, `${p.name} tried to draw, but the draw deck and recycle pile are both empty.`);
  } else {
    log(state, `${p.name} drew ${drawn} card${drawn === 1 ? '' : 's'}.`);
  }
  events.push({ type: 'DRAWN', count: drawn });
  return events;
}

function failActiveJailbreak(state) {
  const p = currentPlayer(state);
  const failedKings = [...state.jailbreak.kings];
  state.jailbreak.kings = [];
  let penalties = 0;
  failedKings.forEach(king => {
    king.effectiveValue = null;
    king.playedDirection = null;
    const replacement = drawCard(state);
    if (replacement) {
      p.goal.unshift(replacement);
      penalties++;
    }
  });
  failedKings.forEach(king => state.deck.push(king));
  state.deck = shuffle(state.deck);
  log(state, `Jailbreak failed. ${failedKings.length} unplayed King${failedKings.length === 1 ? ' was' : 's were'} reshuffled into the draw deck${penalties ? ` and ${penalties} card${penalties === 1 ? ' was' : 's were'} added to the bottom of ${p.name}'s goal pile` : ''}.`);
  return { count: failedKings.length, penalties };
}

// action: { type:'DISCARD_TO_PORT', playerIndex, cardId, portIndex }
function applyDiscardToPort(state, action) {
  const events = [];
  if (state.status !== 'IN_ROUND') throw new RuleError('No round is in progress.');
  if (action.playerIndex !== state.currentPlayer) throw new RuleError('It is not your turn.');
  const p = currentPlayer(state);
  const idx = p.hand.findIndex(c => c.id === action.cardId);
  if (idx < 0) throw new RuleError('Select a card from your hand to discard.');
  if (action.portIndex < 0 || action.portIndex > 3) throw new RuleError('Invalid Port.');
  const c = p.hand.splice(idx, 1)[0];
  p.discards[action.portIndex].push(c);
  log(state, `${p.name} discarded ${cardLabel(c)} to Port ${action.portIndex + 1}.`);
  events.push({ type: 'DISCARDED', card: cardLabel(c) });

  let failedJailbreak = null;
  if (state.jailbreak && state.jailbreak.active) {
    if (state.jailbreak.kings.length > 0) {
      failedJailbreak = failActiveJailbreak(state);
      events.push({ type: 'JAILBREAK_FAILED', ...failedJailbreak });
    } else {
      log(state, `Jailbreak complete. ${p.name} played every released King before ending the turn.`);
    }
    state.jailbreak = { active: false, kings: [], initialCount: 0, lastOutcome: failedJailbreak ? 'failure' : 'success' };
  }

  if (p.goal.length === 0) {
    state.pendingWinner = null;
    endRound(state, p, events);
    return events;
  }
  // No refill here any more — see the hand-refill note above. The next player's
  // quota is set by nextTurn(), and this player draws on their own turn.
  nextTurn(state);
  events.push({ type: 'TURN_ENDED', nextPlayer: state.currentPlayer });
  return events;
}

const Engine = {
  VALUES, VALUE_NAMES, SUITS, RED, MATCH_LIMITS,
  RuleError,
  normalizeMatchConfig, activeMatchConfig,
  createMatchState, dealRound, advanceRound,
  currentPlayer, topCard, cardLabel,
  nextValuesForRun, kingRequiredValue, unsetNaturalKingChoices, canPlayCardOnRun,
  turnSnapshot, drawEligibility, HAND_LIMIT,
  applyPlayCard, applyDrawHand, applyDiscardToPort
};

// UMD-lite: usable via require() in Netlify Functions (Node) and via a plain
// <script> tag in the browser (as window.Engine), so the phone UI's optimistic
// legality checks (canPlayCardOnRun, kingRequiredValue, etc.) never drift from
// the authoritative copy the server actually runs.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine;
}
if (typeof window !== 'undefined') {
  window.Engine = Engine;
}
