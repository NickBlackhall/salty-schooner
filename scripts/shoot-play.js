// Screenshots /play.html at real phone dimensions against a stubbed view, so a
// layout change can be SEEN without deploying, without a live room, and without
// spending Netlify invocations.
//
// WHY THIS EARNED ITS PLACE IN THE REPO: written 2026-08-11 while building
// remote mode, it immediately caught three defects that were invisible in the
// code and would have shipped — (1) a missing min-width:0 that pushed the logo,
// the fifth hand card, Port 4 and the whole Brig off the right edge, (2) the
// square Brig/HOLD frame art being stretched into wide rectangles, the same
// trap that broke the old player plaques, and (3) a Jailbreak squeezing its own
// "play N Kings" instruction out of the panel. Every visual pass in this project
// has needed a round of resizing against a real screen; this makes that round
// cost seconds instead of a deploy.
//
// Requires playwright (npm i playwright) and the preinstalled Chromium at the
// path below — adjust executablePath if running somewhere else.
//
//   node scripts/shoot-play.js      # writes PNGs to the current directory
//
// It stubs ONLY the view: the same shape getPlayerView() returns. Everything
// else is the real page, real CSS and the page's own render().
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
  const file = path.join(ROOT, p);
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
  brig: { waitingCount: 3, waitingKings: [card(201,'K','♠'), card(202,'K','♥'), card(203,'K','♣')],
          active: false, releasedKings: [], lastOutcome: null },
  players: [
    { seat: 0, name: 'Nick', goalTop: card(91,'5','\u2660'), goalCount: 7, total: 12 },
    { seat: 1, name: 'Jake', goalTop: card(92,'J','\u2665'), goalCount: 9, total: 8 }
  ],
  pendingClinch: null, endedEarly: false, log: [],
  yourSeat: 0, isYourTurn: true,
  yourHand: [card(1,'A','♥'), card(2,'K','♠'), card(3,'4','♦'), card(4,'A','♣'), card(5,'9','♥')],
  yourGoalTop: card(9,'5','♠'), yourGoalCount: 7,
  yourPorts: [
    [card(31,'3','♦'), card(32,'8','♣')],
    [],
    [card(41,'10','♥')],
    []
  ],
  yourDrawCount: 2
};

(async () => {
  await new Promise(r => server.listen(8099, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  async function shoot(name, viewport, mode, tweak) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript(m => localStorage.setItem('salty-display-mode', m), mode);
    await page.goto('http://127.0.0.1:8099/play.html', { waitUntil: 'load' });
    await page.evaluate(v => {
      window.__v = v;
      lastView = v;
      render(v);
    }, tweak ? tweak(JSON.parse(JSON.stringify(VIEW))) : VIEW);
    await page.waitForTimeout(700);
    await page.screenshot({ path: name });
    const err = await page.evaluate(() => document.getElementById('gameUi').classList.contains('hidden'));
    console.log(`${name}  gameUiHidden=${err}`);
    await ctx.close();
  }

  // Portrait phone, remote mode — the thing being built.
  await shoot('remote-portrait.png', { width: 390, height: 844 }, 'remote');
  // Same layout mid-Jailbreak, the densest state the Brig ever reaches.
  await shoot('remote-jailbreak.png', { width: 390, height: 844 }, 'remote', v => {
    v.brig.active = true;
    v.brig.releasedKings = [card(301,'K','♠'), card(302,'K','♥'), card(303,'K','♣'), card(304,'K','♦')];
    return v;
  });
  // Six players: five opponent chips, the widest that strip can ever get.
  await shoot('remote-6player.png', { width: 390, height: 844 }, 'remote', v => {
    v.players = [
      { seat:0, name:'Nick',  goalTop:card(91,'5','\u2660'), goalCount:7, total:12 },
      { seat:1, name:'Jake',  goalTop:card(92,'J','\u2665'), goalCount:9, total:8 },
      { seat:2, name:'Mum',   goalTop:card(93,'2','\u2663'), goalCount:3, total:20 },
      { seat:3, name:'Aditya',goalTop:card(94,'Q','\u2666'), goalCount:11, total:4 },
      { seat:4, name:'Sam',   goalTop:null,                   goalCount:0, total:31 },
      { seat:5, name:'Bea',   goalTop:card(96,'9','\u2660'), goalCount:6, total:15 }
    ];
    return v;
  });
  // Couch mode, landscape — must look exactly as it did before.
  await shoot('couch-landscape.png', { width: 844, height: 390 }, 'couch');

  await browser.close();
  server.close();
})();
