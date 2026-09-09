// Cloud sync tests — run with:  node tests/cloud-sync.test.mjs
//
// These exercise the Cloud module straight out of app/index.html (no copy to drift
// out of date) under a stubbed localStorage, navigator and fetch. What they are
// really defending is the promise in docs/MULTIPLAYER_PREP.md: the game must stay
// fully playable with no network, a wrong key, or no Supabase project at all.
// Every failure path must leave the local record intact and queued, never throw.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(here, '..', 'app', 'index.html'), 'utf8');

// Extract by marker, not line number, so the test survives edits elsewhere in the file.
const startMarker = 'const APP_BUILD';
const endMarker = 'function trackerCopy';
const startIdx = indexHtml.indexOf(startMarker);
const endIdx = indexHtml.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error('Could not locate the Cloud/Telemetry block in app/index.html — markers moved?');
  process.exit(1);
}
const coreSrc = indexHtml.slice(startIdx, endIdx);

// ---- stubs -------------------------------------------------------------------
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)', maxTouchPoints: 5, onLine: true, standalone: false }, writable: true, configurable: true });
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };
globalThis.document = { querySelectorAll: () => [] };

let calls = [];
let mode = 'ok';
globalThis.fetch = async (url, opts) => {
  calls.push({ url, body: JSON.parse(opts.body), prefer: opts.headers.Prefer });
  if (mode === 'throw') throw new Error('network down');
  if (mode === '401') return { ok: false, status: 401 };
  return { ok: true, status: 201 };
};

const mod = new Function(coreSrc + '\nreturn { Cloud, Telemetry, APP_BUILD };');
const { Cloud, Telemetry } = mod();

// ---- helpers -----------------------------------------------------------------
let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name, extra)); };
function playGame(n) {
  Telemetry.startGame(['Nick','Sam'], 4);
  Telemetry.bump('runsCompleted');
  Telemetry.endGame([{name:'Nick',total:3},{name:'Sam',total:9}], {});
}

// ---- 1. sync OFF (no project configured) -------------------------------------
console.log('\n1. Cloud sync off (unconfigured build)');
playGame();
await Cloud.sync('test');
ok('no HTTP request made', calls.length === 0);
ok('game still recorded locally', Telemetry.data.games.length === 1);
ok('statusHtml reports off', Cloud.statusHtml().includes('<b>off</b>'));

// ---- 2. configure and sync ---------------------------------------------------
console.log('\n2. Configured, network healthy');
Cloud.URL = 'https://example.supabase.co'; Cloud.KEY = 'sb_publishable_test';
calls = [];
let sent = await Cloud.sync('test');
ok('one row posted', calls.length === 1, JSON.stringify(calls.length));
ok('reports 1 sent', sent === 1);
ok('uses ignore-duplicates', /ignore-duplicates/.test(calls[0].prefer));
ok('row carries game_id', !!calls[0].body.game_id);
ok('row carries build stamp', calls[0].body.build.includes('build 17'));
ok('device detected as iPad', calls[0].body.device_label.startsWith('iPad'), calls[0]?.body?.device_label);
ok('record marked synced', !!Telemetry.data.games[0].cloudSynced);
ok('persisted to localStorage', JSON.parse(store['saltySchoonerTrackerV2']).games[0].cloudSynced);

// ---- 3. re-sync is a no-op ---------------------------------------------------
console.log('\n3. Re-sync does not resend');
calls = [];
await Cloud.sync('test');
ok('no duplicate request', calls.length === 0);
ok('reports up to date', Cloud.lastResult === 'up to date', Cloud.lastResult);

// ---- 4. network failure -------------------------------------------------------
console.log('\n4. Network throws mid-game');
mode = 'throw'; calls = [];
playGame();
sent = await Cloud.sync('test');
ok('did not throw', true);
ok('nothing banked', sent === 0);
ok('record still queued for retry', !Telemetry.data.games[1].cloudSynced);
ok('status explains failure', /no network/.test(Cloud.lastResult), Cloud.lastResult);

// ---- 5. bad key (HTTP 401) ----------------------------------------------------
console.log('\n5. Wrong key / RLS refuses');
mode = '401'; calls = [];
sent = await Cloud.sync('test');
ok('did not throw', true);
ok('nothing marked synced', !Telemetry.data.games[1].cloudSynced);
ok('status shows HTTP 401', /401/.test(Cloud.lastResult), Cloud.lastResult);

// ---- 6. recovery --------------------------------------------------------------
console.log('\n6. Recovers when network returns');
mode = 'ok'; calls = [];
sent = await Cloud.sync('test');
ok('queued record finally sent', sent === 1);
ok('now marked synced', !!Telemetry.data.games[1].cloudSynced);

// ---- 7. offline flag short-circuits -------------------------------------------
console.log('\n7. navigator.onLine === false');
navigator.onLine = false; calls = [];
playGame();
await Cloud.sync('test');
ok('no request attempted', calls.length === 0);
ok('status says offline', /offline/.test(Cloud.lastResult), Cloud.lastResult);
navigator.onLine = true;

// ---- 8. batch cap -------------------------------------------------------------
// endGame() fires a background sync of its own, so build the backlog with the network
// down (those passes bank nothing), let them settle, then measure one clean pass.
const settle = async () => { for (let i = 0; i < 200 && Cloud.busy; i++) await new Promise(r => setTimeout(r, 0)); };
console.log('\n8. MAX_PER_RUN caps a backlog');
mode = 'throw';
for (let i = 0; i < 20; i++) playGame();
await settle();
const backlog = Cloud.pending().length;
ok('backlog built up while offline', backlog >= 20, 'backlog=' + backlog);
mode = 'ok'; calls = [];
sent = await Cloud.sync('test');
ok('capped at 10 per pass', sent === 10, 'sent=' + sent);
ok('exactly 10 requests made', calls.length === 10, 'calls=' + calls.length);
ok('remainder still queued', Cloud.pending().length === backlog - 10, 'left=' + Cloud.pending().length);
await settle();

// ---- 9. game is unaffected by sync --------------------------------------------
console.log('\n9. Gameplay path never blocked');
mode = 'throw';
let threw = false;
try { playGame(); } catch (e) { threw = true; }
ok('endGame with dead network does not throw', !threw);
ok('local record intact', Telemetry.data.games.every(g => g.id));

console.log('\n' + (fail ? 'FAILURES: ' + fail : 'ALL PASS') + ' (' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
