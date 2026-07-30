// Adaptive polling for the multiplayer screens.
//
// WHY THIS EXISTS: every screen used to poll on a flat setInterval — /play every
// 800ms, /host every 900ms, /tv every 1000ms — with no regard for whether the tab
// was even visible. One /host tab and one /play tab left open in a background
// browser burned ~204,000 Netlify function invocations in two days doing nothing
// at all. A real 4-player game costs ~25,600 invocations/hour on flat polling,
// so a two-hour session was ~51,000. That is not viable.
//
// Four mitigations, in rough order of how much they save:
//
//   1. PAUSE WHEN HIDDEN. A backgrounded tab polls zero times. This alone would
//      have prevented the incident above. The roadmap asked for it originally
//      ("polling slows when the browser tab is hidden") and it was never built.
//   2. STOP WHEN ABANDONED. After idleStopMs with no state change and no user
//      interaction, stop completely and hand control back via onIdleStop() so the
//      page can offer a Resume. A tab left open overnight then costs nothing.
//   3. BACK OFF WHEN NOTHING IS HAPPENING. Each poll returns a signature; if it
//      hasn't changed for a few rounds the interval grows toward maxInterval, and
//      snaps straight back to base the moment anything changes.
//   4. LET THE CALLER SET THE BASE RATE PER STATE via intervalFor(), so a waiting
//      player can poll far slower than the player actually taking a turn.
//
// Uses chained setTimeout rather than setInterval because the delay varies, and
// because setInterval can stack callbacks if a request runs long.
function createPoller({
  poll,                       // async () => signature (any comparable value)
  intervalFor,                // () => base delay in ms for the current state
  maxInterval = 8000,         // ceiling once backed off
  backoffAfter = 5,           // unchanged polls before backing off
  idleStopMs = 15 * 60 * 1000,
  onIdleStop = null,          // called when polling stops itself
  onError = null
}) {
  let timer = null;
  let running = false;
  let lastSignature = undefined;
  let unchangedCount = 0;
  let lastChangeAt = Date.now();
  let lastInteractionAt = Date.now();

  function currentDelay() {
    const base = Math.max(250, intervalFor());
    if (unchangedCount < backoffAfter) return base;
    // Grow gently: double once per backoffAfter polls beyond the threshold.
    const steps = Math.floor(unchangedCount / backoffAfter);
    return Math.min(maxInterval, base * Math.pow(2, steps));
  }

  function schedule() {
    clearTimeout(timer);
    if (!running || document.hidden) return;   // hidden tabs are not scheduled at all
    timer = setTimeout(tick, currentDelay());
  }

  async function tick() {
    if (!running || document.hidden) return;
    try {
      const sig = await poll();
      if (sig !== lastSignature) {
        lastSignature = sig;
        unchangedCount = 0;
        lastChangeAt = Date.now();
      } else {
        unchangedCount++;
      }
    } catch (e) {
      if (onError) onError(e);
      unchangedCount++;   // a failing endpoint should back off too, not hammer
    }
    // Abandoned: nothing has changed and nobody has touched it in a long time.
    const idleFor = Date.now() - Math.max(lastChangeAt, lastInteractionAt);
    if (idleStopMs && idleFor > idleStopMs) {
      stop();
      if (onIdleStop) onIdleStop();
      return;
    }
    schedule();
  }

  function start() {
    if (running) return;
    running = true;
    lastChangeAt = Date.now();
    lastInteractionAt = Date.now();
    unchangedCount = 0;
    tick();                       // poll immediately on start
  }
  function stop() {
    running = false;
    clearTimeout(timer);
    timer = null;
  }
  // Force an immediate poll and return to the fast rate — call after submitting an
  // action, so the acting player never waits out a backed-off delay.
  function kick() {
    if (!running) return;
    unchangedCount = 0;
    lastInteractionAt = Date.now();
    clearTimeout(timer);
    tick();
  }
  function noteInteraction() { lastInteractionAt = Date.now(); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);        // stop dead; cost while backgrounded is zero
    } else if (running) {
      noteInteraction();
      kick();                     // catch up the moment the tab is looked at again
    }
  });
  // Any touch/click counts as "someone is still here", which defers the idle stop.
  ['pointerdown', 'keydown'].forEach(ev =>
    document.addEventListener(ev, noteInteraction, { passive: true }));

  return { start, stop, kick, noteInteraction, isRunning: () => running };
}
