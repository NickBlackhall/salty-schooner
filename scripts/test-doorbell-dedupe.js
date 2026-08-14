// Tests that a doorbell pulse does not trigger a redundant get-state fetch, and
// — the harder half — that suppressing it never mutes a real opponent move.
//
// WHY THIS IS FIDDLY. submit-action.js writes the room, THEN awaits bumpPulse(),
// THEN returns its HTTP response. So the realtime broadcast and the HTTP
// response leave the server at different moments over different transports, and
// either can reach this phone first. A naive "is the pulse newer than lastView"
// check is correct only in the response-first ordering; in the pulse-first
// ordering lastView is still stale, the check says "newer, fetch it", and the
// fetch is redundant because the answer was already on its way.
//
// Every case below is therefore an ORDERING, not a feature. The dangerous
// failure is not a wasted fetch — it is suppressing a pulse that was really an
// opponent's move, which would leave the board frozen until the next 45s
// safety-net poll.
//
//   npm i playwright
//   node scripts/test-doorbell-dedupe.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'app');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.mp3':'audio/mpeg' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/play') p = '/play.html';
  fs.readFile(path.join(ROOT, p), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(path.join(ROOT, p))] || 'application/octet-stream' });
    res.end(buf);
  });
});

const V = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };
const card = (id, rank, suit) => ({ id: String(id), rank, suit, value: V[rank] });
const RULES_VERSION = require(path.join(ROOT, 'shared', 'engine.js')).RULES_VERSION;

const VIEW = () => ({
  roomCode: '52EZ', status: 'IN_ROUND', stateVersion: 42, engineRules: RULES_VERSION,
  round: 2, maxRounds: 4, holdCards: 10,
  currentSeat: 0, currentPlayerName: 'Nick', deckCount: 37, recycleCount: 4,
  runs: [
    { direction: 'up',   cards: [card(101,'5','♦'), card(102,'6','♠'), card(103,'7','♥')] },
    { direction: null,   cards: [] },
    { direction: 'down', cards: [card(111,'Q','♠'), card(112,'3','♦'), card(113,'2','♣')] },
    { direction: 'up',   cards: [card(121,'2','♣'), card(122,'3','♥'), card(123,'4','♠')] }
  ],
  brig: { waitingCount: 3, waitingKings: [card(201,'K','♠')], active: false, releasedKings: [], lastOutcome: null },
  players: [
    { seat: 0, name: 'Nick', goalTop: card(91,'5','♠'), goalCount: 7, total: 12 },
    { seat: 1, name: 'Jake', goalTop: card(92,'J','♥'), goalCount: 9, total: 8 }
  ],
  pendingClinch: null, endedEarly: false, log: [],
  yourSeat: 0, isYourTurn: true,
  yourHand: [card(1,'8','♠'), card(2,'9','♥'), card(3,'K','♣'), card(4,'A','♥'), card(5,'4','♦')],
  yourGoalTop: card(9,'5','♠'), yourGoalCount: 7,
  yourPorts: [[card(31,'3','♦')], [], [card(41,'10','♥')], []],
  yourDrawCount: 0
});

async function boot(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => localStorage.setItem('salty-display-mode', 'remote'));
  await page.goto('http://127.0.0.1:8095/play.html', { waitUntil: 'load' });
  await page.evaluate(v => {
    roomId = 'test-room';
    creds = { playerId: 'p1', resumeToken: 'tok', seat: 0 };
    window.__calls = [];
    window.__pending = [];
    window.__fetches = 0;                 // every get-state = one Netlify invocation
    Api.submitAction = (a) => {
      window.__calls.push(a);
      return new Promise((res, rej) => window.__pending.push({ res, rej }));
    };
    Api.getPlayerState = () => {
      window.__fetches++;
      return Promise.resolve(window.__nextFetch || JSON.parse(JSON.stringify(lastView)));
    };
    lastView = v;
    render(v);
    poller.start();                       // so wake()/kick() behave as in real use
  }, VIEW());
  await page.waitForTimeout(200);
  // start() polls immediately; ignore that one so counts below are about pulses
  await page.evaluate(() => { window.__fetches = 0; });
  page.__errs = errs;
  return { ctx, page };
}

const fetches = page => page.evaluate(() => window.__fetches);
const counts  = page => page.evaluate(() => JSON.parse(JSON.stringify(Perf.counts)));
const tapPlay = async (page) => {
  await page.click('#handRow .card[data-id="1"]', { timeout: 4000 });
  await page.click('#runsGrid .run[data-run="0"]', { timeout: 4000, position: { x: 8, y: 8 } });
};
// The response submit-action would return for that play.
const confirm = (page, version) => page.evaluate(v => {
  const nv = JSON.parse(JSON.stringify(lastView));
  nv.stateVersion = v;
  nv.yourHand = nv.yourHand.filter(c => c.id !== '1');
  nv.runs[0].cards.push({ id: '1', rank: '8', suit: '♠', value: 8 });
  window.__pending.shift().res({ view: nv });
}, version);

// --- cases -------------------------------------------------------------------

// The one that matters most: MY pulse beats MY response home. Must not fetch.
async function pulseBeforeResponse(page) {
  await tapPlay(page);
  await page.waitForTimeout(40);
  await page.evaluate(() => handlePulse(43, { programmatic: false }));   // pulse first
  const duringHold = await fetches(page);
  await confirm(page, 43);                                              // response second
  await page.waitForTimeout(150);
  const after = await fetches(page);
  const c = await counts(page);
  return { pass: duringHold === 0 && after === 0 && c.doorbellHeld === 1 && c.doorbellHeldFollowup === 0,
           detail: `fetchesDuringHold=${duringHold} fetchesAfter=${after} held=${c.doorbellHeld} followup=${c.doorbellHeldFollowup}` };
}

// Response wins the race; the pulse is then plainly already-known.
async function responseBeforePulse(page) {
  await tapPlay(page);
  await page.waitForTimeout(40);
  await confirm(page, 43);
  await page.waitForTimeout(120);
  await page.evaluate(() => handlePulse(43, { programmatic: false }));
  await page.waitForTimeout(120);
  const after = await fetches(page);
  const c = await counts(page);
  return { pass: after === 0 && c.doorbellSuppressed >= 1,
           detail: `fetches=${after} suppressed=${c.doorbellSuppressed} held=${c.doorbellHeld}` };
}

// THE DANGEROUS ONE. A pulse held during my action turns out to carry a version
// my response does not cover — somebody else moved too. It must still fetch.
async function opponentMoveDuringMyAction(page) {
  await tapPlay(page);
  await page.waitForTimeout(40);
  await page.evaluate(() => handlePulse(44, { programmatic: false }));   // 44 > my 43
  const duringHold = await fetches(page);
  await confirm(page, 43);                                              // mine only reaches 43
  // poller.forceTick() holds every forced fetch to minForcedGapMs (900ms), so
  // the follow-up fetch is deferred rather than immediate. Wait past that floor.
  await page.waitForTimeout(1400);
  const after = await fetches(page);
  const c = await counts(page);
  return { pass: duringHold === 0 && after === 1 && c.doorbellHeldFollowup === 1,
           detail: `duringHold=${duringHold} afterSettle=${after} followup=${c.doorbellHeldFollowup}` };
}

// No local action outstanding: a genuine opponent pulse must fetch at once.
async function idleOpponentPulseFetches(page) {
  await page.evaluate(() => handlePulse(43, { programmatic: false }));
  await page.waitForTimeout(1400);   // past minForcedGapMs
  const after = await fetches(page);
  const c = await counts(page);
  return { pass: after === 1 && c.doorbellHeld === 0,
           detail: `fetches=${after} held=${c.doorbellHeld} suppressed=${c.doorbellSuppressed}` };
}

// A pulse for a version already covered is dropped without a fetch or a hold.
async function staleP2ulseIgnored(page) {
  await page.evaluate(() => handlePulse(41, { programmatic: false }));   // < lastView 42
  await page.evaluate(() => handlePulse(42, { programmatic: false }));   // == lastView 42
  await page.waitForTimeout(150);
  const after = await fetches(page);
  const c = await counts(page);
  return { pass: after === 0 && c.doorbellSuppressed === 2,
           detail: `fetches=${after} suppressed=${c.doorbellSuppressed}` };
}

// Several predicted plays queued: the held pulse resolves against the LAST of
// them, and still does not fetch when they cover it.
async function multipleQueuedActions(page) {
  await tapPlay(page);
  await page.waitForTimeout(30);
  await page.click('#handRow .card[data-id="2"]', { timeout: 4000 });
  await page.click('#runsGrid .run[data-run="0"]', { timeout: 4000, position: { x: 8, y: 8 } });
  await page.waitForTimeout(30);
  await page.evaluate(() => handlePulse(44, { programmatic: false }));
  await confirm(page, 43);                       // first settles; queue still has one
  await page.waitForTimeout(100);
  const midway = await fetches(page);
  await page.evaluate(() => {
    const nv = JSON.parse(JSON.stringify(lastView));
    nv.stateVersion = 44;
    nv.yourHand = nv.yourHand.filter(c => c.id !== '2');
    nv.runs[0].cards.push({ id: '2', rank: '9', suit: '♥', value: 9 });
    window.__pending.shift().res({ view: nv });
  });
  await page.waitForTimeout(200);
  const after = await fetches(page);
  return { pass: midway === 0 && after === 0,
           detail: `afterFirstConfirm=${midway} afterSecondConfirm=${after}` };
}

// A rejected action still has to release a held pulse rather than strand it.
async function rejectionReleasesHold(page) {
  await tapPlay(page);
  await page.waitForTimeout(40);
  await page.evaluate(() => handlePulse(44, { programmatic: false }));
  await page.evaluate(() => { window.__pending.shift().rej(new Error('Illegal play.')); });
  await page.waitForTimeout(300);
  const held = await page.evaluate(() => heldPulseVersion);
  // reconcile() refetches authoritative state itself, so the board is current
  // either way; what must not happen is a pulse left held forever.
  return { pass: held === null, detail: `heldPulseVersion=${held === null ? 'released' : held}` };
}

// --- measurement semantics ---------------------------------------------------
// These assert the REPORTING, not the behaviour. An earlier version of this
// instrumentation timed a held pulse from the moment the hold was RELEASED,
// which excluded the whole hold from the one number the hold makes interesting,
// and reported "painted" for frames that were never drawn. Both were wrong in
// the flattering direction, which is exactly why they need tests.

// A held pulse's latency must include the hold, not start after it.
async function heldPulseTimesFromReceipt(page) {
  await tapPlay(page);
  await page.waitForTimeout(40);
  await page.evaluate(() => handlePulse(44, { programmatic: false }));   // held
  await page.waitForTimeout(700);                                        // sit in the hold
  await confirm(page, 43);                                               // does not cover 44
  await page.waitForTimeout(1500);                                       // past the forced-poll floor
  const spans = await page.evaluate(() => JSON.parse(JSON.stringify(Perf.pulseSpans)));
  const first = spans.toFetch[0];
  // Must include the ~700ms hold. Timed from release it would be near zero.
  return { pass: typeof first === 'number' && first >= 650,
           detail: `toFetch=${first == null ? 'none' : Math.round(first) + 'ms'} (must include the ~700ms hold)` };
}

// An unchanged result is 'applied', never 'painted'.
// After the dedupe this should be RARE in real play — a doorbell fetch that
// comes back with nothing to draw is precisely what the suppression exists to
// avoid, so a non-zero count here is a signal that one slipped through. Driven
// directly rather than via handlePulse, because handlePulse would (correctly)
// suppress an already-known version before any fetch happened.
async function unchangedIsAppliedNotPainted(page) {
  await page.evaluate(() => {
    notePulseReceived(42);                                       // open an observation
    nextPollCause = 'doorbell';                                  // attribute the fetch
    window.__nextFetch = JSON.parse(JSON.stringify(lastView));   // returns the same version
    poller.refresh();
  });
  await page.waitForTimeout(1500);
  const spans = await page.evaluate(() => JSON.parse(JSON.stringify(Perf.pulseSpans)));
  return { pass: spans.toApplied.length === 1 && spans.toPainted.length === 0,
           detail: `applied=${spans.toApplied.length} painted=${spans.toPainted.length}` };
}

// A real change reports as painted, once.
async function changeIsPainted(page) {
  await page.evaluate(() => {
    const nv = JSON.parse(JSON.stringify(lastView));
    nv.stateVersion = 43;
    nv.runs[0].cards.push({ id: '999', rank: '8', suit: '♠', value: 8 });
    window.__nextFetch = nv;
    handlePulse(43, { programmatic: false });
  });
  await page.waitForTimeout(1500);
  const spans = await page.evaluate(() => JSON.parse(JSON.stringify(Perf.pulseSpans)));
  return { pass: spans.toPainted.length === 1 && spans.toApplied.length === 0,
           detail: `painted=${spans.toPainted.length} applied=${spans.toApplied.length}` };
}

// A timer poll running while an observation is open must not be credited with
// doorbell latency.
async function timerPollDoesNotStealAttribution(page) {
  await page.evaluate(() => {
    notePulseReceived(99);                 // an observation is open
    nextPollCause = 'timer';               // but the next poll is a timer poll
    poller.refresh();
  });
  await page.waitForTimeout(1500);
  const spans = await page.evaluate(() => JSON.parse(JSON.stringify(Perf.pulseSpans)));
  return { pass: spans.toFetch.length === 0,
           detail: `toFetch entries after a timer poll=${spans.toFetch.length} (want 0)` };
}

// The 900ms floor is a gap between fetches, not a flat delay: with no recent
// poll it must not delay at all, and when it does bite it must be recorded.
async function forcedFloorIsMeasured(page) {
  const idle = await page.evaluate(async () => {
    // With no doorbell connected the poller runs its FAST rate (1.2s on your
    // own turn), so a quiet window longer than the 900ms floor never opens and
    // the floor would appear to bite always. Pretend realtime is live, which is
    // the real-world condition, and the base rate becomes the 45s safety net.
    doorbell.isLive = () => true;
    poller.reschedule();
    Perf.forcedDelays.length = 0;
    await new Promise(r => setTimeout(r, 1100));   // let the floor lapse
    handlePulse(43, { programmatic: false });
    return Perf.forcedDelays.length;
  });
  // Now two pulses in quick succession: the second must hit the floor.
  const back2back = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1100));
    handlePulse(44, { programmatic: false });
    await new Promise(r => setTimeout(r, 60));
    lastView.stateVersion = 44;                    // so 45 still counts as new
    handlePulse(45, { programmatic: false });
    return Perf.forcedDelays.length;
  });
  return { pass: idle === 0 && back2back > 0,
           detail: `delaysAfterIdlePulse=${idle} (want 0), afterBackToBack=${back2back} (want >0)` };
}

const CASES = [
  ['pulse before response',   pulseBeforeResponse,       'my own pulse beating my own response costs no fetch'],
  ['response before pulse',   responseBeforePulse,       'the other ordering is plainly already-known'],
  ['opponent moved too',      opponentMoveDuringMyAction,'a held pulse my response does not cover STILL fetches'],
  ['idle opponent pulse',     idleOpponentPulseFetches,  'with nothing outstanding, fetch immediately'],
  ['stale pulse',             staleP2ulseIgnored,        'a pulse at or below lastView is dropped'],
  ['multiple queued actions', multipleQueuedActions,     'a held pulse resolves against the whole queue'],
  ['rejection releases hold', rejectionReleasesHold,     'a failed action never strands a held pulse'],
  ['held timed from receipt', heldPulseTimesFromReceipt, 'a held pulse’s latency includes the hold'],
  ['unchanged is applied',    unchangedIsAppliedNotPainted, 'nothing drawn is never reported as painted'],
  ['change is painted',       changeIsPainted,           'a real change reports painted, once'],
  ['no stolen attribution',   timerPollDoesNotStealAttribution, 'a timer poll is not credited with doorbell latency'],
  ['forced floor measured',   forcedFloorIsMeasured,     'the 900ms floor is a gap, and its hits are counted']
];

(async () => {
  await new Promise(r => server.listen(8095, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  let failed = 0;
  for (const [name, fn, what] of CASES) {
    const { ctx, page } = await boot(browser);
    let r;
    try { r = await fn(page); }
    catch (e) { r = { pass: false, detail: 'threw: ' + e.message }; }
    if (page.__errs.length) r = { pass: false, detail: 'page error: ' + page.__errs[0] };
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${name} — ${what}\n        ${r.detail}`);
    await ctx.close();
  }
  console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL PASS');
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})();
