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
  // Backstop against the failure this whole file exists to prevent: no STATE
  // CHANGE for this long stops polling no matter what has been deferring the
  // idle timer. idleStopMs above can be pushed back indefinitely by anything
  // that counts as interaction, which is exactly how a /tv left on a dead lobby
  // polled for 17 hours and burned ~61,000 invocations (half the monthly quota)
  // — see the kick()/refresh() split below for the specific bug. This one cannot
  // be deferred, so a screen nobody is playing on always dies eventually.
  hardStopMs = 90 * 60 * 1000,
  // Floor on FORCED polls. Every "fetch right now" path funnels through
  // forceTick() and cannot beat this gap, whatever is calling it and however
  // often. This is the backstop for the 2026-08-09 blowout: a Realtime socket
  // that connected and died once a second poked this poller on every edge, and
  // because each poke both fetched immediately and reset the backoff, the
  // screen ran at ~2 fetches/second — ~7,200/hour against a 125,000/month cap —
  // for an entire session, including 11 minutes when nobody was playing at all.
  // The rates configured above meant nothing, because nothing was reading them.
  // Reproduced in scripts/test-flap-cost.js.
  minForcedGapMs = 900,
  onIdleStop = null,          // called when polling stops itself
  onError = null
}) {
  let timer = null;
  let running = false;
  let lastSignature = undefined;
  let unchangedCount = 0;
  let lastChangeAt = Date.now();
  let lastInteractionAt = Date.now();
  let lastPollAt = 0;         // when the last poll FINISHED; the schedule hangs off this
  let polling = false;        // a poll is in flight

  function currentDelay() {
    const base = Math.max(250, intervalFor());
    if (unchangedCount < backoffAfter) return base;
    // Grow gently: double once per backoffAfter polls beyond the threshold.
    const steps = Math.floor(unchangedCount / backoffAfter);
    // The ceiling must never sit below the base, or "backing off" would speed
    // polling UP. That is live once Realtime is connected: intervalFor() returns
    // a slow safety-net rate (30s) that is far above maxInterval (8-10s), and
    // Math.min alone would silently clamp a quiet game back to 10s polling —
    // exactly the cost this was meant to remove.
    const ceiling = Math.max(maxInterval, base);
    return Math.min(ceiling, base * Math.pow(2, steps));
  }

  // Deadline-based, not "delay from now". Every call converges on the same
  // absolute next-poll time (last poll + current delay), so a caller that
  // recomputes the schedule repeatedly can neither drag polls forward nor
  // starve them by restarting the countdown on each call. The old version
  // restarted the countdown, which made repeated rescheduling unsafe in both
  // directions and is why connection changes had to force a fetch instead.
  function schedule() {
    clearTimeout(timer);
    if (!running || document.hidden) return;   // hidden tabs are not scheduled at all
    const due = lastPollAt + currentDelay();
    timer = setTimeout(tick, Math.max(0, due - Date.now()));
  }

  async function tick() {
    if (!running || document.hidden) return;
    // A forced poll can land while one is already in flight. Overlapping
    // fetches cost double, race each other's render, and can apply an older
    // view last. The in-flight one schedules the next tick on its way out, so
    // dropping this one loses nothing.
    if (polling) return;
    polling = true;
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
    } finally {
      polling = false;
      lastPollAt = Date.now();
    }
    // Abandoned: nothing has changed and nobody has touched it in a long time.
    const now = Date.now();
    const idleFor = now - Math.max(lastChangeAt, lastInteractionAt);
    // ...or the game itself has been frozen for so long that whatever is
    // deferring idleStopMs cannot be a person playing. Deliberately measured
    // from lastChangeAt ONLY, so no amount of interaction can postpone it.
    const frozenFor = now - lastChangeAt;
    if ((idleStopMs && idleFor > idleStopMs) || (hardStopMs && frozenFor > hardStopMs)) {
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
  //
  // ONLY for things a HUMAN did. It defers the idle stop, so calling it from
  // machinery is how a screen becomes immortal: /tv wired its Realtime
  // connect/disconnect handler to kick(), and a flapping socket then reset the
  // 20-minute timer forever. Use refresh() for anything not driven by a person.
  function kick() {
    if (!running) return;
    unchangedCount = 0;
    lastInteractionAt = Date.now();
    forceTick();
  }

  // The single door every "fetch now" request goes through, and the only place
  // the floor can be enforced. Callers ask for immediacy; this decides whether
  // they get it. Under the floor the request is not dropped, just deferred to
  // the earliest allowed moment — so a legitimate nudge still lands promptly,
  // while a caller firing twice a second gets one poll per gap instead of two.
  function forceTick() {
    clearTimeout(timer);
    const since = Date.now() - lastPollAt;
    if (since < minForcedGapMs) {
      timer = setTimeout(tick, minForcedGapMs - since);
      return;
    }
    tick();
  }
  // Same immediate poll, but does NOT count as someone being present. For
  // programmatic nudges — a socket reconnecting, a tab becoming visible — which
  // should refresh what is on screen without claiming anybody is still playing.
  // No-ops when stopped, so it can never resurrect a screen that gave up.
  function refresh() {
    if (!running) return;
    unchangedCount = 0;
    forceTick();
  }

  // Re-evaluate the delay under a CHANGED BASE RATE, fetching nothing and
  // leaving the backoff alone. This is what a connection state change actually
  // needs: losing the socket should restore fast polling now rather than after
  // one more 45s wait, but a socket coming and going is not evidence that the
  // GAME changed, and must not be allowed to imply it.
  //
  // Connection changes used to call refresh() instead, which fetched on every
  // edge AND reset the backoff — so a flapping socket set the poll rate and the
  // configured intervals were never consulted. That is the whole 2026-08-09
  // bug in one line; keep these two functions distinct. (The same class of
  // mistake as the kick()/refresh() split above, one layer down.)
  function reschedule() {
    if (!running) return;
    schedule();
  }
  function noteInteraction() { lastInteractionAt = Date.now(); }

  // For a caller that already has fresh data from somewhere OTHER than poll()
  // — a Realtime push carrying its own snapshot — and wants this poller's
  // bookkeeping (signature, backoff, idle timers) kept honest without paying
  // for a redundant fetch to get a signature it already knows. This is exactly
  // tick()'s success bookkeeping, lifted out so it can run without calling
  // poll(). Counts as a real update (touches lastChangeAt, same as a genuine
  // poll would), but deliberately does NOT touch lastInteractionAt or the
  // schedule — the next safety-net tick fires on its normal cadence, since
  // there is nothing stale left for it to catch up on.
  function announce(sig) {
    if (!running) return;
    if (sig !== lastSignature) {
      lastSignature = sig;
      unchangedCount = 0;
      lastChangeAt = Date.now();
    }
  }

  // Fetch now whether or not we are currently running. A Realtime doorbell can
  // ring after the idle stop has already fired — someone wandered back to the
  // table and played — and kick() alone returns early when stopped, which would
  // leave the game looking frozen on a screen that had given up. Returns true if
  // it had to restart, so the page can clear any "paused" panel it is showing.
  function wake() {
    if (running) { kick(); return false; }
    start();
    return true;
  }

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

  return { start, stop, kick, refresh, reschedule, announce, wake, noteInteraction, isRunning: () => running };
}
