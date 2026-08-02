// Tests the hand-refill rule (docs/RULES.md §8), including the 2026-08-02 change
// that a cleared hand only earns a fresh 5 once the start-of-turn quota is spent.
//
//   node scripts/test-draw-rule.js
//
// Worth keeping: this rule has now been changed twice on the strength of real
// play, and both times the interesting behaviour was an interaction between the
// quota and an empty hand rather than either rule alone.
const engine = require('../netlify/functions/lib/engine');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${actual}, expected ${expected})`);
}

// A real dealt state, then hand/quota are posed directly. drawEligibility is a
// pure function of (status, currentPlayer, hand length, drawQuota), so posing
// those exercises the actual rule rather than a mock of it.
function poseState(handSize, quota) {
  const state = engine.createMatchState(['A', 'B'], { rounds: 2 });
  engine.dealRound(state);
  state.status = 'IN_ROUND';
  state.currentPlayer = 0;
  state.players[0].hand = state.players[0].hand.slice(0, handSize);
  state.drawQuota = quota;
  return state;
}
const eligible = (handSize, quota) => engine.drawEligibility(poseState(handSize, quota), 0);

console.log('--- the reported scenario: start the turn holding 3 ---');
check('holding 3, quota 2 -> owed 2',                 eligible(3, 2), 2);
check('played 1 (holding 2), quota 2 -> still 2',     eligible(2, 2), 2);
check('played 2 (holding 1), quota 2 -> still 2',     eligible(1, 2), 2);
check('played all 3 (holding 0), quota 2 -> STILL 2', eligible(0, 2), 2);   // the change
check('then drew the 2 (holding 2), quota 0 -> 0',    eligible(2, 0), 0);
check('played both (holding 0), quota 0 -> fresh 5',  eligible(0, 0), 5);

console.log('\n--- clearing a full hand still earns a fresh hand ---');
check('holding 5 at turn start -> quota 0, owed 0',   eligible(5, 0), 0);
check('played all 5 (holding 0), quota 0 -> 5',       eligible(0, 0), 5);

console.log('\n--- the old behaviour is genuinely gone ---');
// Previously ANY empty hand returned HAND_LIMIT regardless of quota, which made
// "dump your hand before drawing" strictly dominant.
check('holding 0 with quota 1 -> 1, not 5',           eligible(0, 1), 1);
check('holding 0 with quota 4 -> 4, not 5',           eligible(0, 4), 4);

console.log('\n--- the turn-start formula is unchanged ---');
const dealt = engine.createMatchState(['A', 'B'], { rounds: 2 });
engine.dealRound(dealt);
check('everyone dealt 5, so opening quota is 0',      dealt.drawQuota, 0);
check('opening hand size is 5',                       dealt.players[0].hand.length, engine.HAND_LIMIT);

console.log('\n--- the deal matches what the button promised ---');
// The button shows/hides on yourDrawCount, which is drawEligibility. If
// applyDrawHand ever dealt a different number the player would be lied to.
for (const [handSize, quota] of [[3, 2], [0, 2], [0, 0], [1, 4]]) {
  const state = poseState(handSize, quota);
  const promised = engine.drawEligibility(state, 0);
  const before = state.players[0].hand.length;
  engine.applyDrawHand(state, { type: 'DRAW_HAND', playerIndex: 0 });
  const actuallyDealt = state.players[0].hand.length - before;
  check(`hand ${handSize} / quota ${quota}: promised ${promised}, dealt`, actuallyDealt, promised);
  check(`  ...and the quota is spent afterwards`, state.drawQuota, 0);
}

console.log('\n--- drawing twice does not double-dip ---');
const twice = poseState(0, 2);
engine.applyDrawHand(twice, { type: 'DRAW_HAND', playerIndex: 0 });
check('after taking the 2, holding 2', twice.players[0].hand.length, 2);
let threw = false;
try { engine.applyDrawHand(twice, { type: 'DRAW_HAND', playerIndex: 0 }); }
catch (e) { threw = e instanceof engine.RuleError; }
check('a second draw with cards in hand is refused', threw, true);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
