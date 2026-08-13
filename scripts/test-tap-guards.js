// Proves the two render guards added on 2026-08-13 actually fix the thing they
// were added for, by running the SAME tests against the old code first.
//
// WHY THIS IS A BROWSER TEST AND NOT A NODE STUB: the bug is DOM event timing.
// A click only fires when the press and the release resolve to the same element,
// so a render that replaces a card between pointerdown and pointerup destroys
// the tap. Nothing about that is reproducible with a fake clock and a stubbed
// DOM — it needs a real browser dispatching real pointer events in real order.
//
//   npm i playwright
//   node scripts/test-tap-guards.js
//
// Expected: OLD fails `gesture` and `unchanged`; NEW passes all three. If OLD
// passes the gesture test, the test is not exercising the bug and must not be
// trusted to verify the fix (the convention this repo has used since
// test-draw-rule.js — write it, prove it catches the old behaviour, then fix).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'app');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.mp3':'audio/mpeg' };

// Which file answers /play.html — swapped between the old and new builds.
let playFile = path.join(ROOT, 'play.html');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const file = (p === '/play' || p === '/play.html') ? playFile : path.join(ROOT, p);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const card = (id, rank, suit) => ({ id: String(id), rank, suit });

const VIEW = {
  roomCode: '52EZ', status: 'IN_ROUND', stateVersion: 42,
  round: 2, maxRounds: 4, holdCards: 10,
  currentSeat: 0, currentPlayerName: 'Nick',
  deckCount: 37, recycleCount: 4,
  runs: [
    { direction: 'up',   cards: [card(101,'5','♦'), card(102,'6','♠'), card(103,'7','♥')] },
    { direction: null,   cards: [] },
    { direction: 'down', cards: [card(111,'Q','♠'), card(112,'J','♦')] },
    { direction: 'up',   cards: [card(121,'2','♣'), card(122,'3','♥'), card(123,'4','♠')] }
  ],
  brig: { waitingCount: 3, waitingKings: [card(201,'K','♠')], active: false, releasedKings: [], lastOutcome: null },
  players: [
    { seat: 0, name: 'Nick', goalTop: card(91,'5','♠'), goalCount: 7, total: 12 },
    { seat: 1, name: 'Jake', goalTop: card(92,'J','♥'), goalCount: 9, total: 8 }
  ],
  pendingClinch: null, endedEarly: false, log: [],
  yourSeat: 0, isYourTurn: true,
  yourHand: [card(1,'A','♥'), card(2,'7','♠'), card(3,'4','♦'), card(4,'A','♣'), card(5,'9','♥')],
  yourGoalTop: card(9,'5','♠'), yourGoalCount: 7,
  yourPorts: [[card(31,'3','♦')], [], [card(41,'10','♥')], []],
  yourDrawCount: 2
};

const clone = v => JSON.parse(JSON.stringify(v));

async function boot(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('salty-display-mode', 'remote'));
  await page.goto('http://127.0.0.1:8098/play.html', { waitUntil: 'load' });
  // Seed the board directly, the same way shoot-play.js does: no room, no
  // network, no invocations — only the render path is under test.
  await page.evaluate(v => { lastView = v; render(v); }, VIEW);
  await page.waitForTimeout(250);
  return { ctx, page };
}

// THE BUG ITSELF. Press a hand card, let a poll land mid-gesture, then release.
// The tap must still register. On the old code the poll rebuilds #handRow while
// the finger is down, the pressed element stops existing, and the click never
// reaches its handler.
async function testGesture(page) {
  const box = await page.locator('#handRow .card').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // A poll arriving with genuinely newer state, exactly as one would mid-touch.
  await page.evaluate(v => { v.stateVersion = 43; applyView(v); }, clone(VIEW));
  await page.mouse.up();
  await page.waitForTimeout(120);   // let the deferred flush run
  const sel = await page.evaluate(() => (typeof selected !== 'undefined' && selected) ? selected.card.id : null);
  return { pass: sel === '1', detail: `selected=${sel === null ? 'nothing (tap lost)' : sel}` };
}

// An unchanged poll must not rebuild the board. Same version, same status —
// there is nothing new to draw, and the rebuild is what collides with touches.
async function testUnchanged(page) {
  const n = await page.evaluate(v => {
    const orig = window.render;
    let count = 0;
    window.render = (x) => { count++; return orig(x); };
    try {
      applyView(v);          // identical version and status to what is shown
      applyView(v);
      return count;
    } finally { window.render = orig; }
  }, clone(VIEW));
  return { pass: n === 0, detail: `${n} render(s) for 2 unchanged polls` };
}

// The guard must never be able to freeze the board. If a pointer goes down and
// its release is never reported — capture lost to a system gesture, tab switched
// mid-touch — the held render has to come out on its own.
async function testSafety(page) {
  const box = await page.locator('#handRow .card').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(v => { v.stateVersion = 44; v.yourHand = v.yourHand.slice(0, 2); applyView(v); }, clone(VIEW));
  const during = await page.evaluate(() => document.querySelectorAll('#handRow .card').length);
  await page.waitForTimeout(1400);  // past POINTER_GUARD_MAX_MS
  const after = await page.evaluate(() => document.querySelectorAll('#handRow .card').length);
  await page.mouse.up();
  return { pass: after === 2, detail: `held at ${during} cards during gesture, ${after} after timeout` };
}

const CASES = [
  ['gesture',   testGesture,   'tap survives a poll landing mid-press'],
  ['unchanged', testUnchanged, 'unchanged poll does not rebuild the board'],
  ['safety',    testSafety,    'held render is released if the pointer never lifts']
];

(async () => {
  await new Promise(r => server.listen(8098, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // The old build comes straight out of git, so "before" is the real committed
  // code and not a hand-made approximation of it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'schooner-old-'));
  const oldFile = path.join(tmp, 'play.html');
  fs.writeFileSync(oldFile, execFileSync('git', ['show', 'HEAD:app/play.html'],
    { cwd: path.join(__dirname, '..'), maxBuffer: 1 << 26 }));

  const results = {};
  for (const [build, file] of [['OLD', oldFile], ['NEW', path.join(ROOT, 'play.html')]]) {
    playFile = file;
    results[build] = {};
    for (const [name, fn] of CASES) {
      const { ctx, page } = await boot(browser);
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      try {
        const r = await fn(page);
        results[build][name] = errs.length ? { pass: false, detail: 'page error: ' + errs[0] } : r;
      } catch (e) {
        results[build][name] = { pass: false, detail: 'threw: ' + e.message };
      }
      await ctx.close();
    }
  }

  console.log('');
  for (const [name, , what] of CASES) {
    console.log(`${name} — ${what}`);
    for (const build of ['OLD', 'NEW']) {
      const r = results[build][name];
      console.log(`   ${build}  ${r.pass ? 'PASS' : 'FAIL'}  ${r.detail}`);
    }
    console.log('');
  }

  const newFails = CASES.filter(([n]) => !results.NEW[n].pass).map(([n]) => n);
  // The old build passing `gesture` would mean the test never reproduced the
  // bug, so a green NEW would prove nothing.
  const oldCaught = !results.OLD.gesture.pass && !results.OLD.unchanged.pass;
  console.log(oldCaught
    ? 'OLD reproduced both defects — the tests are exercising the real behaviour.'
    : 'WARNING: OLD did not reproduce the defects; these tests prove nothing.');
  console.log(newFails.length ? `NEW FAILED: ${newFails.join(', ')}` : 'NEW passed all cases.');

  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(newFails.length || !oldCaught ? 1 : 0);
})();
