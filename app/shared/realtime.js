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
  label = 'doorbell'
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
  let live = false;
  let stopped = true;
  let retries = 0;
  let retryTimer = null;

  function setLive(next) {
    if (next === live) return;
    live = next;
    console.info(`[${label}] realtime ${live ? 'LIVE — polling drops to safety-net rate' : 'DOWN — falling back to polling'}`);
    if (onLiveChange) onLiveChange(live);
  }

  // The vendored bundle may simply not be there (blocked, cached badly, edited
  // out). That is a supported state, not a crash: we stay not-live forever and
  // the screen polls exactly as it did before this file existed.
  function libraryPresent() {
    return typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function';
  }

  function connect() {
    if (stopped) return;
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
    try {
      if (!client) {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          db: { schema: 'salty_schooner' },
          // No user accounts in this game; never touch storage or refresh tokens.
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
      }
      teardownChannel();

      // Targeted on purpose: one table, filtered to this room. The Make It
      // Terrible repo subscribes with event:'*' / schema:'public' and filters
      // client-side, which wakes every client for every row in the database.
      // Do not copy that here.
      channel = client
        .channel(`pulse:${key.value}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'salty_schooner', table: 'room_pulse', filter: `${key.column}=eq.${key.value}` },
          payload => {
            const version = payload && payload.new ? payload.new.state_version : null;
            retries = 0;                       // a delivered message proves the socket is healthy
            try { onChange(version); } catch (e) { console.error(`[${label}] onChange threw`, e); }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            retries = 0;
            setLive(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setLive(false);
            scheduleRetry();
          }
        });
    } catch (e) {
      console.error(`[${label}] connect failed`, e);
      setLive(false);
      scheduleRetry();
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

  function teardownChannel() {
    if (channel && client) {
      try { client.removeChannel(channel); } catch (e) { /* already gone */ }
    }
    channel = null;
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
    teardownChannel();
    setLive(false);
  }

  // A backgrounded phone gets its socket killed by the OS with no error event —
  // the tab simply returns to a dead channel. Re-establish on the way back in,
  // and fetch immediately, because we cannot know what was missed while away.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || stopped) return;
      if (!live) connect();
      try { onChange(null); } catch (e) { /* handled by caller */ }
    });
  }

  return { start, stop, isLive: () => live };
}
