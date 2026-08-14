// Reproduces the 2026-08-09 playtest cost blowout: a Realtime socket that
// connects and immediately drops, over and over, drove ~2 state fetches PER
// SECOND for a whole session — measured against production (Supabase request
// logs showed ~50 get-state calls in 24s, sustained flat for 11 minutes while
// nobody was even playing, with the poller's backoff never engaging once).
//
// WHY A TEST AND NOT JUST A FIX: this is the third pass at this class of bug
// (flat polling → adaptive polling → the 17-hour kick() incident → this), and
// each previous fix was reasoned about rather than reproduced. So this runs the
// REAL app/shared/poller.js and app/shared/realtime.js — wired together exactly
// as app/play.html wires them — against a stubbed clock and a stubbed socket,
// and counts fetches. Run it against the old code and it fails loudly; that is
// the point. Nothing here mocks the units under test.
//
//   node scripts/test-flap-cost.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---- Virtual clock ----------------------------------------------------------
// Real time would make a 10-minute scenario take 10 minutes. Everything below
// runs on a fake clock so the whole suite is instant and deterministic.
let now = 0;
let timerSeq = 0;
const timers = new Map();

const fakeSetTimeout = (fn, ms) => {
  const id = ++timerSeq;
  timers.set(id, { at: now + Math.max(0, ms || 0), fn });
  return id;
};
const fakeClearTimeout = (id) => { timers.delete(id); };
const fakeDate = { now: () => now };

// Let queued promise callbacks run. tick() is async, so a fired timer's work is
// not finished when its callback returns.
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

async function advanceTo(target) {
  for (;;) {
    let next = null;
    for (const [id, t] of timers) {
      if (!next || t.at < next.t.at) next = { id, t };
    }
    if (!next || next.t.at > target) break;
    now = next.t.at;
    timers.delete(next.id);
    try { next.t.fn(); } catch (e) { console.error('timer threw', e); }
    await flush();
  }
  now = target;
  await flush();
}

// ---- Stubs ------------------------------------------------------------------
const fakeDocument = { hidden: false, addEventListener: () => {} };

// A Supabase client whose channel status we drive by hand. subscribe() stores
// the status callback so the scenario can push SUBSCRIBED / CHANNEL_ERROR at
// whatever cadence it likes.
function makeFakeSupabase() {
  const state = { statusCb: null, topics: [], removed: 0 };
  const client = {
    channel(topic) {
      state.topics.push(topic);
      const ch = {
        topic,
        on() { return ch; },
        subscribe(cb) { state.statusCb = cb; return ch; }
      };
      return ch;
    },
    removeChannel() { state.removed++; return Promise.resolve('ok'); }
  };
  return {
    state,
    window: { supabase: { createClient: () => client } }
  };
}

// ---- Module loading ---------------------------------------------------------
// Both files are browser scripts (bare function declarations, no exports), so
// they are evaluated with the globals they expect shadowed by our stubs.
function loadPoller() {
  const src = fs.readFileSync(path.join(ROOT, 'app/shared/poller.js'), 'utf8');
  return new Function(
    'setTimeout', 'clearTimeout', 'Date', 'document',
    src + '\nreturn createPoller;'
  )(fakeSetTimeout, fakeClearTimeout, fakeDate, fakeDocument);
}

function loadDoorbell(fakeWindow) {
  const src = fs.readFileSync(path.join(ROOT, 'app/shared/realtime.js'), 'utf8');
  const quietConsole = { info: () => {}, warn: () => {}, error: () => {}, log: () => {} };
  return new Function(
    'setTimeout', 'clearTimeout', 'Date', 'document', 'window', 'console',
    src + '\nreturn createDoorbell;'
  )(fakeSetTimeout, fakeClearTimeout, fakeDate, fakeDocument, fakeWindow, quietConsole);
}

// ---- Scenario ---------------------------------------------------------------
// Wires poller + doorbell the way app/play.html does, then flaps the socket.
function buildPlayScreen() {
  const supa = makeFakeSupabase();
  const createPoller = loadPoller();
  const createDoorbell = loadDoorbell(supa.window);

  let fetches = 0;
  let version = 1;

  const poller = createPoller({
    poll: async () => { fetches++; return 'IN_ROUND:' + version; },
    // Same rates as app/play.html: 45s safety net once the doorbell is live,
    // 1.2s for the player whose turn it is when it is not.
    intervalFor: () => (doorbell.isLive() ? 45000 : 1200),
    maxInterval: 10000,
    idleStopMs: 30 * 60 * 1000,
    hardStopMs: 90 * 60 * 1000,
    onIdleStop: () => {}
  });

  const doorbell = createDoorbell({
    roomId: () => 'room-1',
    label: 'test',
    onChange: (v, meta) => (meta && meta.programmatic) ? poller.refresh() : poller.wake(),
    // The line under test. Old code: poller.refresh() — a forced fetch on every
    // transition. New code: poller.reschedule() — recompute the delay, fetch
    // nothing.
    onLiveChange: () => (poller.reschedule ? poller.reschedule() : poller.refresh())
  });

  return { supa, poller, doorbell, fetchCount: () => fetches };
}

function pushStatus(supa, status) {
  if (supa.state.statusCb) supa.state.statusCb(status);
}

// ---- Test 1: flapping socket must not drive the fetch rate ------------------
async function testFlapping() {
  now = 0; timers.clear();
  const screen = buildPlayScreen();
  screen.poller.start();
  screen.doorbell.start();
  await flush();

  // The socket subscribes, then dies ~900ms later, forever. This is the exact
  // production signature: paired requests ~120ms apart repeating at ~1s, which
  // is one fetch on the DOWN edge and one on the UP edge of each cycle.
  const MINUTES = 10;
  const END = MINUTES * 60 * 1000;
  let t = 0;
  while (t < END) {
    pushStatus(screen.supa, 'SUBSCRIBED');
    await flush();
    await advanceTo(Math.min(t + 900, END));
    pushStatus(screen.supa, 'CHANNEL_ERROR');   // dies almost immediately
    await flush();
    await advanceTo(Math.min(t + 1000, END));
    t += 1000;
  }

  const fetches = screen.fetchCount();
  // A screen whose socket is mostly-up should sit near the 45s safety net.
  // Ten minutes of that is ~13 fetches. Anything approaching one per second
  // (600+) is the production failure. The ceiling is deliberately generous —
  // this is a guard against catastrophe, not a precision assertion.
  const CEILING = 60;
  const perHour = Math.round(fetches / MINUTES * 60);
  console.log(`  flapping socket, ${MINUTES} min: ${fetches} fetches (~${perHour}/hour)`);
  if (fetches > CEILING) {
    throw new Error(
      `FAIL: ${fetches} fetches in ${MINUTES} min (~${perHour}/hour) exceeds ceiling ${CEILING}. ` +
      `A flapping socket is driving the poll rate — this is the production bug.`
    );
  }
  return { fetches, perHour };
}

// ---- Test 2: a real sustained outage must still fall back to fast polling ---
// The fix must not "solve" the cost problem by going deaf. If the socket is
// genuinely gone, the screen has to notice and resume polling, or the game
// freezes for everyone — which is a worse bug than the one being fixed.
async function testRealOutageStillPolls() {
  now = 0; timers.clear();
  const screen = buildPlayScreen();
  screen.poller.start();
  screen.doorbell.start();
  await flush();

  pushStatus(screen.supa, 'SUBSCRIBED');
  await flush();
  await advanceTo(60 * 1000);          // a minute of healthy connection
  const afterHealthy = screen.fetchCount();

  pushStatus(screen.supa, 'CHANNEL_ERROR');
  await flush();
  await advanceTo(now + 60 * 1000);    // a minute of genuine outage
  const duringOutage = screen.fetchCount() - afterHealthy;

  console.log(`  healthy minute: ${afterHealthy} fetches | outage minute: ${duringOutage} fetches`);
  // At 1.2s base with backoff toward 10s, a minute of real outage should be
  // comfortably more than the ~1-2 fetches a live socket needs.
  if (duringOutage < 6) {
    throw new Error(
      `FAIL: only ${duringOutage} fetches during a real one-minute outage. ` +
      `The screen has gone deaf — it must fall back to polling when the socket is truly down.`
    );
  }
  return { afterHealthy, duringOutage };
}

// ---- Test 3: reconnect backoff must actually escalate -----------------------
// The specific defect: `retries` was reset on every SUBSCRIBED, so a
// connect-then-die cycle reset the backoff every time and the client retried
// once a second forever, never escalating toward its own 30s ceiling.
async function testBackoffEscalates() {
  now = 0; timers.clear();
  const screen = buildPlayScreen();
  screen.doorbell.start();
  await flush();

  const gaps = [];
  for (let i = 0; i < 6; i++) {
    pushStatus(screen.supa, 'SUBSCRIBED');
    await flush();
    pushStatus(screen.supa, 'CHANNEL_ERROR');   // dies at once, every time
    await flush();
    const before = screen.supa.state.topics.length;
    const startedAt = now;
    // Run until the client actually opens another channel.
    for (let step = 0; step < 120 && screen.supa.state.topics.length === before; step++) {
      await advanceTo(now + 500);
    }
    gaps.push(now - startedAt);
  }

  console.log(`  reconnect gaps (ms): ${gaps.join(', ')}`);
  if (gaps[gaps.length - 1] <= gaps[0]) {
    throw new Error(
      `FAIL: reconnect backoff never grew (${gaps.join(', ')}). ` +
      `A connection that subscribes then immediately dies resets the retry counter, ` +
      `pinning reconnects at the shortest delay forever.`
    );
  }
  return gaps;
}

// ---- Runner -----------------------------------------------------------------
(async () => {
  const results = [];
  const tests = [
    ['flapping socket does not drive the fetch rate', testFlapping],
    ['a real outage still falls back to polling', testRealOutageStillPolls],
    ['reconnect backoff escalates', testBackoffEscalates]
  ];

  let failed = 0;
  for (const [name, fn] of tests) {
    console.log(`\n• ${name}`);
    try {
      await fn();
      console.log('  PASS');
      results.push([name, 'PASS']);
    } catch (e) {
      console.log('  ' + e.message);
      results.push([name, 'FAIL']);
      failed++;
    }
  }

  console.log('\n' + results.map(([n, r]) => `${r}  ${n}`).join('\n'));
  process.exit(failed ? 1 : 0);
})();
