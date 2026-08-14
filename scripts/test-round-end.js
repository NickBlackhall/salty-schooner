// Tests when a round ENDS after a player clears their HOLD pile.
//
//   node scripts/test-round-end.js
//
// Rule change of 2026-08-02, decided by the group at a physical table:
// clearing your HOLD pile no longer ends the round on the spot. You may keep
// making legal plays, and the round ends when you discard.
//
// Three cases, and the whole point of this file is that they are different:
//   1. Jailbreak still owes released Kings -> do NOT end, resolve it first.
//   2. HOLD empty AND hand empty         -> end IMMEDIATELY. There is nothing
//      left to play and no card to discard with, so waiting for a discard would
//      force the player to draw a fresh hand just to end a round that is
//      already over. This case is the reason the fix is not simply "end at
//      discard".
//   3. HOLD empty, hand still holds cards -> do NOT end. Play on; the round
//      ends at the discard that finishes the turn. This is the new behaviour.
const engine = require('../netlify/functions/lib/engine');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${actual}, expected ${expected})`);
}

let n = 0;
const card = (rank, suit) => ({ id: 'T' + (++n), rank, suit, value: engine.VALUES[rank] });

// A controlled board: Run 1 holds 5♠ ascending, so playing 6♠ onto it is legal.
// Everything else is emptied so only the thing under test can fire.
function board({ goal, hand, jailbreakKings = 0 }) {
  const state = engine.createMatchState(['Nick', 'Mum'], { rounds: 2, holdCards: 10 });
  engine.dealRound(state);
  state.status = 'IN_ROUND';
  state.currentPlayer = 0;
  state.runs = [
    { cards: [card('5', '♠')], direction: 'up' },
    { cards: [], direction: null },
    { cards: [], direction: null },
    { cards: [], direction: null }
  ];
  state.brig = [];
  state.jailbreak = jailbreakKings
    ? { active: true, kings: Array.from({ length: jailbreakKings }, () => card('K', '♣')), initialCount: jailbreakKings }
    : { active: false, kings: [], initialCount: 0 };
  const p = state.players[0];
  p.goal = goal;
  p.hand = hand;
  p.discards = [[], [], [], []];
  return state;
}

const playTopOfGoal = (state) => engine.applyPlayCard(state, {
  type: 'PLAY_CARD', playerIndex: 0,
  cardId: state.players[0].goal[state.players[0].goal.length - 1].id,
  runIndex: 0
});

console.log('--- case 3: HOLD cleared, cards still in hand -> round does NOT end ---');
{
  const s = board({ goal: [card('6', '♠')], hand: [card('9', '♥'), card('3', '♣')] });
  playTopOfGoal(s);
  check('HOLD is now empty',                s.players[0].goal.length, 0);
  check('round is still running',           s.status, 'IN_ROUND');
  check('hand untouched, still playable',   s.players[0].hand.length, 2);

  // ...and the discard that ends the turn is what ends the round.
  engine.applyDiscardToPort(s, { type: 'DISCARD_TO_PORT', playerIndex: 0, cardId: s.players[0].hand[0].id, portIndex: 0 });
  check('discarding ends the round',        s.status, 'ROUND_RESULTS');
}

console.log('\n--- case 2 (the edge case): HOLD and hand both empty -> ends AT ONCE ---');
{
  const s = board({ goal: [card('6', '♠')], hand: [] });
  playTopOfGoal(s);
  check('round ended without a discard',    s.status, 'ROUND_RESULTS');
  check('and the player scored zero',       s.players[0].roundScore, 0);
}

console.log('\n--- the reported scenario, played through exactly ---');
{
  // Last HOLD card, then a legal hand card, then discard the last one: 0 points.
  const s = board({ goal: [card('6', '♠')], hand: [card('7', '♠'), card('3', '♣')] });
  playTopOfGoal(s);
  check('after last HOLD card: still going', s.status, 'IN_ROUND');
  engine.applyPlayCard(s, { type: 'PLAY_CARD', playerIndex: 0, cardId: s.players[0].hand[0].id, runIndex: 0 });
  check('7♠ played onto the run',            s.runs[0].cards.length, 3);
  check('still going after the hand play',   s.status, 'IN_ROUND');
  engine.applyDiscardToPort(s, { type: 'DISCARD_TO_PORT', playerIndex: 0, cardId: s.players[0].hand[0].id, portIndex: 0 });
  check('discard ends it',                   s.status, 'ROUND_RESULTS');
  check('scored zero, as at the table',      s.players[0].roundScore, 0);
}

console.log('\n--- case 1: an unfinished Jailbreak still outranks everything ---');
{
  const s = board({ goal: [card('6', '♠')], hand: [card('9', '♥')], jailbreakKings: 1 });
  playTopOfGoal(s);
  check('HOLD empty but Kings still loose',  s.status, 'IN_ROUND');
  check('the Jailbreak is still active',     s.jailbreak.active, true);
}
{
  // Same, but with an empty hand — case 2 must NOT short-circuit an owed
  // Jailbreak, because released Kings are played from the Brig, not the hand.
  const s = board({ goal: [card('6', '♠')], hand: [], jailbreakKings: 1 });
  playTopOfGoal(s);
  check('empty hand does not skip the Jailbreak', s.status, 'IN_ROUND');
}

console.log('\n--- regressions: nothing else should have moved ---');
{
  const s = board({ goal: [card('2', '♦'), card('6', '♠')], hand: [card('9', '♥')] });
  playTopOfGoal(s);
  check('HOLD not empty -> no round end',    s.status, 'IN_ROUND');
  check('one HOLD card remains',             s.players[0].goal.length, 1);
}
{
  // Scoring still counts hand cards left over.
  const s = board({ goal: [card('6', '♠')], hand: [card('9', '♥'), card('3', '♣')] });
  playTopOfGoal(s);
  engine.applyDiscardToPort(s, { type: 'DISCARD_TO_PORT', playerIndex: 0, cardId: s.players[0].hand[0].id, portIndex: 0 });
  check('1 card left in hand scores 1',      s.players[0].roundScore, 1);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
