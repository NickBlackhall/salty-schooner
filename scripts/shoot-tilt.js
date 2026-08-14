// Screenshots the tabletop-tilt board (2026-08-14) across the widths and states
// that actually stress it: the Brig's passive and active in-table states,
// the grouped released-King stack, the opponent rail at both
// player-count extremes, and the slice(-3) run renderer under a long run. Same
// technique as shoot-play.js — stub the view, hit the real render() — just a
// wider matrix, per review: four phone widths, three Brig states, 2 vs 6
// players, and the interaction states (selection, pending-play ring) that
// depend on tap targets surviving the DOM restructure.
//
// Launches a FRESH BROWSER PER SHOT. Not just caution: in the sandbox this was
// built in, a single shared browser instance reliably died after 9-14
// contexts (resource limits, not a bug in the page), and a screenshot script
// that silently stops partway through a matrix is worse than one that is a
// little slower.
//
//   node scripts/shoot-tilt.js
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

const card = (id, rank, suit) => ({ id: String(id), rank, suit });

const baseView = () => ({
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
  brig: { waitingCount: 3, waitingKings: [card(201,'K','♠'), card(202,'K','♥'), card(203,'K','♣')],
          active: false, releasedKings: [], lastOutcome: null },
  players: [
    { seat: 0, name: 'Nick', goalTop: card(91,'5','♠'), goalCount: 7, total: 12 },
    { seat: 1, name: 'Jake', goalTop: card(92,'J','♥'), goalCount: 9, total: 8 }
  ],
  pendingClinch: null, endedEarly: false, log: [],
  yourSeat: 0, isYourTurn: true,
  yourHand: [card(1,'A','♥'), card(2,'K','♠'), card(3,'4','♦'), card(4,'A','♣'), card(5,'9','♥')],
  yourGoalTop: card(9,'5','♠'), yourGoalCount: 7,
  yourPorts: [
    [card(31,'3','♦'), card(32,'8','♣')], [], [card(41,'10','♥')], []
  ],
  yourDrawCount: 2
});

const sixPlayers = [
  { seat:0, name:'Nick',  goalTop:card(91,'5','♠'), goalCount:7,  total:12 },
  { seat:1, name:'Jake',  goalTop:card(92,'J','♥'), goalCount:9,  total:8 },
  { seat:2, name:'Mum',   goalTop:card(93,'2','♣'), goalCount:3,  total:20 },
  { seat:3, name:'Aditya',goalTop:card(94,'Q','♦'), goalCount:11, total:4 },
  { seat:4, name:'Sam',   goalTop:null,              goalCount:0,  total:31 },
  { seat:5, name:'Beatrice-Longname', goalTop:card(96,'9','♠'), goalCount:6, total:15 }
];

async function shoot(name, { width = 390, height = 844, mode = 'remote', tweak, after } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(m => localStorage.setItem('salty-display-mode', m), mode);
    await page.goto('http://127.0.0.1:8093/play.html', { waitUntil: 'load' });
    const v = tweak ? tweak(baseView()) : baseView();
    await page.evaluate(view => { lastView = view; render(view); }, v);
    await page.waitForTimeout(200);
    if (after) await after(page);
    await page.screenshot({ path: name });
    const brigParent = await page.evaluate(() => {
      const el = document.querySelector('.brigBox').parentElement;
      return el.id || el.className;
    });
    console.log(`${name}  w=${width} mode=${mode}  brigParent=${brigParent}`
      + (errs.length ? `  PAGEERROR: ${errs[0]}` : ''));
    await ctx.close();
    return errs;
  } finally { await browser.close(); }
}

(async () => {
  await new Promise(r => server.listen(8093, r));
  let allErrs = [];

  for (const w of [320, 360, 390, 430]) {
    allErrs.push(...await shoot(`tilt-${w}-passive.png`, { width: w }));
  }

  for (const w of [320, 430]) {
    allErrs.push(...await shoot(`tilt-${w}-brig-empty.png`, { width: w, tweak: v => {
      v.brig = { waitingCount: 0, waitingKings: [], active: false, releasedKings: [], lastOutcome: null };
      return v;
    }}));
    allErrs.push(...await shoot(`tilt-${w}-brig-6waiting.png`, { width: w, tweak: v => {
      v.brig.waitingCount = 6;
      v.brig.waitingKings = ['♠','♥','♦','♣','♠','♥'].map((s,i) => card(300+i,'K',s));
      return v;
    }}));
    // The dangerous state: an active Jailbreak with the full 24-King deck-per-
    // player maximum, on MY turn — must stay compact without covering sources.
    allErrs.push(...await shoot(`tilt-${w}-jailbreak-24.png`, { width: w, tweak: v => {
      const suits = ['♠','♥','♦','♣'];
      v.brig = {
        waitingCount: 0, waitingKings: [], active: true, lastOutcome: null,
        releasedKings: Array.from({ length: 24 }, (_, i) => card(400 + i, 'K', suits[i % 4]))
      };
      return v;
    }}));
  }

  // All four runs populated, including one showing the 3-of-N slice truncation
  // (deliberately NOT a new unbounded-overlap system — the existing renderer
  // already caps display at 3, review confirmed this is sufficient).
  allErrs.push(...await shoot('tilt-390-runs-full.png', { tweak: v => {
    v.runs = [
      { direction: 'up',   cards: [card(101,'2','♦'),card(102,'3','♠'),card(103,'4','♥'),card(104,'5','♣'),card(105,'6','♦'),card(106,'7','♠')] },
      { direction: 'down', cards: [card(111,'Q','♠'),card(112,'J','♦'),card(113,'10','♣')] },
      { direction: 'up',   cards: [card(121,'2','♣'),card(122,'3','♥')] },
      { direction: 'down', cards: [card(131,'Q','♦'),card(132,'J','♠'),card(133,'10','♥')] }
    ];
    return v;
  }}));

  // Six players, long name included, opponent rail across the tilt header.
  allErrs.push(...await shoot('tilt-390-6players.png', { tweak: v => { v.players = sixPlayers; return v; }}));
  allErrs.push(...await shoot('tilt-320-6players.png', { width: 320, tweak: v => { v.players = sixPlayers; return v; }}));

  // Selection sources: HOLD, Port and a released Jailbreak King paint correctly
  // after the DOM move — hand selection is covered by every other shot already.
  allErrs.push(...await shoot('tilt-390-select-jailbreak-king.png', { tweak: v => {
    v.brig.active = true;
    v.brig.releasedKings = [card(301,'K','♠'), card(302,'K','♥')];
    return v;
  }, after: page => page.evaluate(() => selectCard('jailbreak', lastView.brig.releasedKings[0])) }));

  // Pending-play ring target, on a TRANSFORMED run — confirms the optimistic
  // feedback added earlier this session still lands correctly under rotateX.
  allErrs.push(...await shoot('tilt-390-pending-target.png', {
    after: page => page.evaluate(() => { beginPendingPlay('1', 0); })
  }));

  // Couch mode — its layout path is unchanged; the remote wrapper and Brig
  // reparenting must have zero effect outside data-mode="remote".
  allErrs.push(...await shoot('tilt-couch-untouched.png', { width: 844, height: 390, mode: 'couch' }));

  console.log(allErrs.length ? `\n${allErrs.length} PAGE ERROR(S)` : '\nNo page errors across the matrix.');
  server.close();
  process.exit(allErrs.length ? 1 : 0);
})();
