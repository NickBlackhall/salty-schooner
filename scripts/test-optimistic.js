// Tests the scoped optimistic queue: ordinary run plays land LOCALLY and the
// next tap is accepted immediately, while everything outside the safe set still
// waits for the server.
//
// This is the change the project has twice been burned by attempting, so the
// tests are weighted towards the ways it goes WRONG — the exclusions, the
// rejection path, and the ordering of sends — not towards proving the happy
// case looks fast.
//
// Runs in headless Chromium against a stubbed Api, so no room, no network and
// no Netlify invocations. Api.submitAction is held open deliberately: every
// "is it on the run already?" assertion is made while the request is still
// outstanding, which is the only way to prove the board did not wait for it.
//
//   npm i playwright
//   node scripts/test-optimistic.js
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

const VALUES = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13 };
const card = (id, rank, suit) => ({ id: String(id), rank, suit, value: VALUES[rank] });

// Engine version the page will agree with — read from the real file so the
// fixture cannot drift from it.
const RULES_VERSION = require(path.join(ROOT, 'shared', 'engine.js')).RULES_VERSION;

const VIEW = () => ({
  roomCode: '52EZ', status: 'IN_ROUND', stateVersion: 42, engineRules: RULES_VERSION,
  round: 2, maxRounds: 4, holdCards: 10,
  currentSeat: 0, currentPlayerName: 'Nick', deckCount: 37, recycleCount: 4,
  runs: [
    // next legal card is 8 UP — an ordinary play that does not finish the run
    { direction: 'up',   cards: [card(101,'5','♦'), card(102,'6','♠'), card(103,'7','♥')] },
    { direction: null,   cards: [] },
    // next legal card is A DOWN, which COMPLETES it — must never be predicted
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

async function boot(browser, tweak) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => localStorage.setItem('salty-display-mode', 'remote'));
  await page.goto('http://127.0.0.1:8097/play.html', { waitUntil: 'load' });
  const view = tweak ? tweak(VIEW()) : VIEW();
  await page.evaluate(v => {
    // The page normally gets these from a real join; without them every action
    // throws while ASSEMBLING the request, before the stub is even reached.
    roomId = 'test-room';
    creds = { playerId: 'p1', resumeToken: 'tok', seat: 0 };
    // Hold every action open so assertions can be made mid-flight.
    window.__calls = [];
    window.__pending = [];
    Api.submitAction = (args) => {
      window.__calls.push(args);
      return new Promise((resolve, reject) => window.__pending.push({ resolve, reject }));
    };
    Api.getPlayerState = () => Promise.resolve(window.__resyncView || v);
    lastView = v;
    render(v);
  }, view);
  await page.waitForTimeout(150);
  page.__errs = errs;
  return { ctx, page };
}

// Remote mode draws only the LAST THREE cards of a run (render: r.cards.slice(-3)),
// so counting DOM cards cannot tell a 3-card run from a 4-card one. Assert on the
// run the player is actually looking at, plus the top card visible on it.
const runLen = (page, i) => page.evaluate(i => shownView().runs[i].cards.length, i);
const runTop = (page, i) => page.evaluate(i => {
  const els = document.querySelectorAll(`#runsGrid .run[data-run="${i}"] .card`);
  return els.length ? els[els.length - 1].textContent.trim() : null;
}, i);
const handCards = page => page.evaluate(() => document.querySelectorAll('#handRow .card').length);
const tapCard = async (page, id) => { await page.click(`#handRow .card[data-id="${id}"]`, { timeout: 4000 }); };
const tapRun = async (page, i) => { await page.click(`#runsGrid .run[data-run="${i}"]`, { timeout: 4000, position: { x: 8, y: 8 } }); };

// --- cases -------------------------------------------------------------------

// The headline: the card is on the run before the server has answered.
async function landsBeforeServer(page) {
  await tapCard(page, '1');
  await tapRun(page, 0);
  await page.waitForTimeout(60);
  const len = await runLen(page, 0);
  const top = await runTop(page, 0);
  const hand = await handCards(page);
  const sent = await page.evaluate(() => window.__calls.length);
  const settled = await page.evaluate(() => window.__pending.length);
  return { pass: len === 4 && top === '8♠' && hand === 4 && sent === 1 && settled === 1,
           detail: `runLen=${len} visibleTop=${top} hand=${hand} sent=${sent} stillPending=${settled}` };
}

// The point of the queue: a second tap is accepted while the first is in flight,
// and is validated against the PREDICTED board, not the stale server one.
async function secondTapAccepted(page) {
  await tapCard(page, '1'); await tapRun(page, 0);
  await page.waitForTimeout(40);
  await tapCard(page, '2'); await tapRun(page, 0);   // 9 follows the predicted 8
  await page.waitForTimeout(60);
  const len = await runLen(page, 0);
  const top = await runTop(page, 0);
  const sent = await page.evaluate(() => window.__calls.length);
  // Both plays are on the board; only ONE request has gone out, because sends
  // are chained rather than raced.
  return { pass: len === 5 && top === '9♥' && sent === 1,
           detail: `runLen=${len} visibleTop=${top} requestsSent=${sent}` };
}

// Sends are serialised, each using the version the previous one returned.
async function sendsAreChained(page) {
  await tapCard(page, '1'); await tapRun(page, 0);
  await page.waitForTimeout(40);
  await tapCard(page, '2'); await tapRun(page, 0);
  await page.waitForTimeout(40);
  const first = await page.evaluate(() => window.__calls[0].expectedVersion);
  await page.evaluate(() => {
    const v = JSON.parse(JSON.stringify(lastView));
    v.stateVersion = 43;
    v.yourHand = v.yourHand.filter(c => c.id !== '1');
    v.runs[0].cards.push({ id: '1', rank: '8', suit: '♠', value: 8 });
    window.__pending.shift().resolve({ view: v });
  });
  await page.waitForTimeout(120);
  const second = await page.evaluate(() => window.__calls[1] && window.__calls[1].expectedVersion);
  return { pass: first === 42 && second === 43, detail: `first=${first} second=${second}` };
}

// A refused play must not leave a board only the client believes in.
async function rejectionResyncs(page) {
  await tapCard(page, '1'); await tapRun(page, 0);
  await page.waitForTimeout(40);
  const before = await runLen(page, 0);
  await page.evaluate(() => { window.__pending.shift().reject(new Error('Illegal play.')); });
  await page.waitForTimeout(250);
  const after = await runLen(page, 0);
  const hand = await handCards(page);
  const resyncs = await page.evaluate(() => Perf.counts.resyncs);
  return { pass: before === 4 && after === 3 && hand === 5 && resyncs === 1,
           detail: `predictedLen=${before} afterReject=${after} hand=${hand} resyncs=${resyncs}` };
}

// --- exclusions: these must all still wait for the server ---------------------

// A King opens the direction modal instead of predicting.
async function kingNotPredicted(page) {
  await tapCard(page, '3');
  await tapRun(page, 0);
  await page.waitForTimeout(80);
  const predicted = await page.evaluate(() => Perf.counts.predicted);
  const modal = await page.evaluate(() => document.getElementById('modalBackdrop').classList.contains('show'));
  return { pass: predicted === 0 && modal, detail: `predicted=${predicted} modalOpen=${modal}` };
}

// Completing a run recycles cards and can send Kings to the Brig — none of which
// is derivable from a view.
async function completingPlayNotPredicted(page) {
  await tapCard(page, '4');     // A♥ onto run 2 (down, top is 2) completes it
  await tapRun(page, 2);
  await page.waitForTimeout(80);
  const predicted = await page.evaluate(() => Perf.counts.predicted);
  const sent = await page.evaluate(() => window.__calls.length);
  return { pass: predicted === 0 && sent === 1, detail: `predicted=${predicted} sent=${sent}` };
}

// With HOLD already empty, a play can END THE ROUND.
async function emptyHoldNotPredicted(page) {
  await tapCard(page, '1');
  await tapRun(page, 0);
  await page.waitForTimeout(80);
  const predicted = await page.evaluate(() => Perf.counts.predicted);
  return { pass: predicted === 0, detail: `predicted=${predicted}` };
}

// A client running different rules from the server must not predict at all.
async function versionMismatchDisables(page) {
  await tapCard(page, '1');
  await tapRun(page, 0);
  await page.waitForTimeout(80);
  const predicted = await page.evaluate(() => Perf.counts.predicted);
  const sent = await page.evaluate(() => window.__calls.length);
  return { pass: predicted === 0 && sent === 1, detail: `predicted=${predicted} sent=${sent}` };
}

const CASES = [
  ['lands before server',      landsBeforeServer,        null,
    'the card is on the run while the request is still outstanding'],
  ['second tap accepted',      secondTapAccepted,        null,
    'a burst of taps is not blocked by the first being in flight'],
  ['sends are chained',        sendsAreChained,          null,
    'each send uses the version the previous confirmation returned'],
  ['rejection resyncs',        rejectionResyncs,         null,
    'a refused play repaints authoritative state'],
  ['King not predicted',       kingNotPredicted,         null,
    'Kings go through the direction modal, never predicted'],
  ['completing play excluded', completingPlayNotPredicted, null,
    'a play that finishes a run waits for the server'],
  ['empty HOLD excluded',      emptyHoldNotPredicted,    v => { v.yourGoalCount = 0; v.yourGoalTop = null; return v; },
    'with HOLD empty a play can end the round, so it waits'],
  ['jailbreak excluded',       emptyHoldNotPredicted,    v => { v.brig.active = true; v.brig.releasedKings = [card(301,'K','♦')]; return v; },
    'an active Jailbreak waits for the server'],
  ['version mismatch',         versionMismatchDisables,  v => { v.engineRules = 'something-else'; return v; },
    'a client on different rules never predicts']
];

(async () => {
  await new Promise(r => server.listen(8097, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  let failed = 0;
  for (const [name, fn, tweak, what] of CASES) {
    const { ctx, page } = await boot(browser, tweak);
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
