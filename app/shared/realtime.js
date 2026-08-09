// The client half of the Realtime doorbell.
//
// WHY THIS EXISTS: polling get-state on a timer burned 191,384 Netlify function
// invocations and got the site auto-paused (WORKLOG entry 19). Adaptive polling
// cut that but left a real 2-hour session at ~18,000 invocations — about seven
// sessions a month against the 125,000 cap. This removes the timer as the thing
// that decides when to fetch: the server tells us when something changed, and we
// fetch once, in response.
//
// WHAT IT DOES NOT DO: carry game state. It subscribes to salty_schooner.room_pulse,
// which holds only room_id / state_version / status. Realtime hands every
// subscriber the entire changed row, and rooms.current_game_state is one jsonb
// blob containing every hand, every goal pile, the Ports and the deck order — so
// subscribing to `rooms` would publish the whole secret game to anyone with the
// publishable key. The nudge arrives here; the actual state still comes from
// get-state, which checks a token and filters per seat. Keep it that way.
//
// FALLBACK IS THE POINT: a phone on hotel wifi will lose this socket. Everything
// here is written so that failure means "poll like we used to", never "the game
// is frozen". isLive() is the single signal each screen uses to choose between
// safety-net polling and the old fast rates.

// Public by design — this is the publishable (anon) key, which is meant to ship
// to browsers. It is only safe because salty_schooner.rooms and .players grant
// it nothing: both have RLS enabled with zero policies AND no table grant, so
// this key can read room_pulse and nothing else. Verified by curl against the
// REST endpoint; see WORKLOG entry 21. If you ever add a table to this schema,
// it is denied to this key by default — keep it that way unless the table is
// provably free of secrets.
const SUPABASE_URL = 'https://qbkcnjlshkckpkoiavje.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_L-oP50-6nKB6XDH8wU-32Q_lpiBY_A8';

// Pass EITHER roomId (/host, /play) or roomCode (/tv, which is token-free and
// never learns the room's uuid). Each may be a value or a function.
function createDoorbell({
  roomId,
  roomCode,
  onChange,                 // (stateVersion) => void — something changed, go fetch
  onLiveChange = null,      // (isLive) => void — connection came up or went down
  label = 'doorbell',
  // How long the socket must stay down before anyone is TOLD it is down. A
  // connection that blips and heals within this window has cost the screen
  // nothing — the doorbell missed no message worth chasing — so reporting it as
  // an outage only causes churn downstream. Reported outages drive the poll
  // rate, so an un-debounced flap is expensive: see scripts/test-flap-cost.js.
  downGraceMs = 4000,
  // How long a subscription must HOLD before it counts as healthy enough to
  // forgive the retry backoff. See the subscribe handler.
  stableMs = 15000
}) {
  // /host does not know its room until create-room returns, and /tv does not
  // know its code until someone types one, so the key must be read at connect
  // time rather than captured when this is constructed. Capturing it would
  // silently subscribe to `room_id=eq.null` and never fire.
  const resolve = (v) => (typeof v === 'function' ? v() : v);
  function subscriptionKey() {
    const id = resolve(roomId);
    if (id) return { column: 'room_id', value: id };
    const code = resolve(roomCode);
    if (code) return { column: 'room_code', value: code };
    return null;
  }
  let client = null;
  let channel = null;
  let live = false;           // the REPORTED state — what isLive() returns
  let stopped = true;
  let retries = 0;
  let retryTimer = null;
  let downTimer = null;       // pending "it really is down" announcement
  let stableTimer = null;     // pending "this connection has held" forgiveness
  let channelSeq = 0;
  let connecting = false;

  // Asymmetric on purpose. Coming UP is announced immediately — there is no
  // cost to believing good news early. Going DOWN is announced only after the
  // socket has STAYED down for downGraceMs, because a momentary drop that heals
  // is indistinguishable from a healthy connection from the game's point of
  // view, and announcing it makes every listener react. A socket dropping and
  // reconnecting once a second announced 7,200 transitions an hour, each one
  // forcing a state fetch.
  function setLive(next) {
    if (next) {
      clearTimeout(downTimer);
      downTimer = null;
      if (live) return;
      live = true;
      announce();
      return;
    }
    if (!live || downTimer) return;   // already down, or already counting down
    downTimer = setTimeout(() => {
      downTimer = null;
      live = false;
      announce();
    }, downGraceMs);
  }

  function announce() {
    console.info(`[${label}] realtime ${live ? 'LIVE — polling drops to safety-net rate' : 'DOWN — falling back to polling'}`);
    if (onLiveChange) onLiveChange(live);
  }

  // The vendored bundle may simply not be there (blocked, cached badly, edited
  // out). That is a supported state, not a crash: we stay not-live forever and
  // the screen polls exactly as it did before this file existed.
  function libraryPresent() {
    return typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function';
  }

  async function connect() {
    if (stopped || connecting) return;   // never build two channels at once
    if (!libraryPresent()) {
      console.warn(`[${label}] supabase bundle missing — staying on polling`);
      setLive(false);
      return;
    }
    const key = subscriptionKey();
    if (!key) {
      // Not an error: the screen simply has no room yet. Retry rather than give
      // up, so the doorbell attaches itself as soon as one exists.
      setLive(false);
      scheduleRetry();
      return;
    }
    connecting = true;
    try {
      if (!client) {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          db: { schema: 'salty_schooner' },
          // No user accounts in this game; never touch storage or refresh tokens.
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
      }
      // AWAITED, unlike before. removeChannel is asynchronous — it has to tell
      // the server the old subscription is going away — and the previous code
      // started building the replacement immediately, while the outgoing
      // channel was still registered under the same topic name. supabase-js
      // keys its channel registry by topic, so the new subscription could
      // collide with the corpse of the old one and be torn straight back down.
      // That failure then triggered another retry, which built another
      // colliding channel: a loop that sustains itself once it starts, which
      // is the best explanation for a socket that subscribes and dies once a
      // second all session. The unique suffix below makes the collision
      // impossible even if a teardown is slow or silently fails.
      await teardownChannel();
      if (stopped) return;

      // Targeted on purpose: one table, filtered to this room. The Make It
      // Terrible repo subscribes with event:'*' / schema:'public' and filters
      // client-side, which wakes every client for every row in the database.
      // Do not copy that here.
      channel = client
        .channel(`pulse:${key.value}:${++channelSeq}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'salty_schooner', table: 'room_pulse', filter: `${key.column}=eq.${key.value}` },
          payload => {
            const version = payload && payload.new ? payload.new.state_version : null;
            retries = 0;                       // a delivered message proves the socket is healthy
            // The row itself rides along as meta.row. It may carry public_state —
            // an already-public board snapshot (see lib/pulse.js) that lets /tv
            // render straight off this push instead of following up with its own
            // fetch. programmatic is false here on purpose: a REAL pulse means
            // somebody actually did something, so it is allowed to restart a
            // screen that had stopped (see wake() vs refresh() at call sites).
            try { onChange(version, { row: payload && payload.new, programmatic: false }); }
            catch (e) { console.error(`[${label}] onChange threw`, e); }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setLive(true);
            // NOT `retries = 0` — that was the bug. Subscribing is not the same
            // as being healthy: a channel that subscribes and dies a moment
            // later reset the counter on every cycle, so the backoff below
            // never grew past its first step and the client reconnected once a
            // second, indefinitely, with no ceiling and no give-up. Forgiveness
            // is now earned by HOLDING the connection (or, above, by actually
            // delivering a message — the only other real proof of health).
            clearTimeout(stableTimer);
            stableTimer = setTimeout(() => { retries = 0; }, stableMs);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(stableTimer);
            stableTimer = null;
            setLive(false);
            scheduleRetry();
          }
        });
    } catch (e) {
      console.error(`[${label}] connect failed`, e);
      setLive(false);
      scheduleRetry();
    } finally {
      connecting = false;
    }
  }

  // Capped exponential backoff. Reconnecting is cheap (it is a websocket, not a
  // function invocation) but a tight loop against a down service helps nobody.
  function scheduleRetry() {
    if (stopped || retryTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(retries, 5)));
    retries++;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
  }

  async function teardownChannel() {
    clearTimeout(stableTimer);
    stableTimer = null;
    const dying = channel;
    channel = null;             // cleared first: nothing may reuse it mid-teardown
    if (dying && client) {
      try { await client.removeChannel(dying); } catch (e) { /* already gone */ }
    }
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    connect();
  }

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    retryTimer = null;
    clearTimeout(downTimer);
    downTimer = null;
    teardownChannel();
    // Straight to the reported state — stopping is deliberate, so there is
    // nothing to debounce and nobody to spare a spurious announcement.
    if (live) { live = false; announce(); }
  }

  // A backgrounded phone gets its socket killed by the OS with no error event —
  // the tab simply returns to a dead channel. Re-establish on the way back in,
  // and fetch immediately, because we cannot know what was missed while away.
  //
  // The second argument marks this as machinery rather than a real pulse: a tab
  // merely becoming visible must not restart a poller that already gave up and
  // showed a paused screen, or an OS churning a background tab keeps a dead game
  // polling forever. Callers route it to refresh() instead of wake().
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || stopped) return;
      if (!live) connect();
      try { onChange(null, { programmatic: true }); } catch (e) { /* handled by caller */ }
    });
  }

  return { start, stop, isLive: () => live };
}
