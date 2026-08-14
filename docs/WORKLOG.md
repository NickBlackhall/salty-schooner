# Salty Schooner — Work Log & Handoff

Purpose: a running status doc so any collaborator — Claude, ChatGPT/Codex, or Nick —
can pick up where the last session left off. Read this and `MASTER_PROJECT_BRIEF.md`
(the authority) before starting work.

Last updated: 2026-08-11 (Claude). Read the 🟢 HANDOFF directly below first;
everything under it is still accurate history but is no longer the current state.

---

## 🟢 HANDOFF (2026-08-11, end of session — read this first)

Stopping for context-window reasons, not a natural break. Everything below is
verified against actual repo/production state at write time, not recalled.

### Deploy state — READ CAREFULLY, prod and origin DIVERGE

```
branch:  multiplayer-prototype, clean, everything pushed
origin:  178e474
PRODUCTION: 982c729  ← FIVE COMMITS BEHIND origin
```

Nick deployed once this session, right after `982c729` (the polling fix), then
playtested it. **Everything after that — all of remote mode — is pushed but NOT
deployed.** Production today has the cost fix and none of the remote-mode work.

To catch production up:
```bash
cd ~/repos/salty-schooner
git pull origin multiplayer-prototype
netlify deploy --prod --build      # must be run from Nick's machine; the agent
                                   # container is policy-blocked from api.netlify.com
```

### What shipped this session, in order

1. **`982c729` — the flapping-socket cost incident (deployed + verified in prod).**
   Full write-up in the 🔴 INCIDENT section below. Short version: a Realtime
   socket that connected and died once a second was driving ~2 state fetches per
   second — **~7,200 invocations/hour against a 125,000/month cap**, sustained,
   including 11 minutes when nobody was playing. Three compounding defects
   (connection changes forcing a fetch *and* resetting the backoff; the retry
   counter reset by a subscribe that immediately died; channels rebuilt under a
   name the old one had not vacated). **Verified fixed in production** across a
   real 45-minute two-player round: idle polling settled to the intended ~45s on
   every screen, no flapping signature, action-driven traffic only.
2. **`bf43dd6` → `2af3c45` — remote mode.** `/play` now draws the whole board in
   portrait when there is no `/tv`. See the REMOTE MODE section below for the
   full design rationale; it is current except where this handoff overrides it.
3. **`178e474`** — docs only.

### Standing conventions added this session — follow without re-deriving

- **`kick()` vs `refresh()` vs `reschedule()` on the poller.** `kick()` = a human
  acted (fetch now, defer idle-stop). `refresh()` = machinery wants fresh data
  (fetch now, do NOT defer idle-stop). `reschedule()` = the base rate changed
  (fetch NOTHING). These look interchangeable and are not — picking wrong has
  now caused **two separate cost incidents**. **Only news about the GAME may
  cost an invocation; a connection changing state is not news about the game.**
- **Every forced poll goes through `forceTick()` and cannot beat
  `minForcedGapMs`.** That floor is the backstop against any future caller
  misbehaving. Do not add a path that calls `tick()` directly.
- **Remote mode is CSS-only off a `data-mode` attribute, one DOM, one render
  path.** Set on both `#gameUi` and `body` (overlays are siblings of `#gameUi`).
  Never fork the markup — `/host` was split off `/play` precisely because
  duplicating the playing UI guarantees drift.
- **Couch sizes cards in `dvh`, remote in `vw`.** Landscape makes height scarce;
  portrait inverts it. **Do not "unify" these units.**
- **`min-width:0` on every flex/grid child in remote mode.** Missing it is what
  pushed half the layout off-screen; it is the same class of bug that ballooned
  `/tv`'s Brig row on 08-07, one axis over.
- **Screenshot before believing a layout.** `scripts/shoot-play.js` (added this
  session) renders `/play` at 390x844 in headless Chromium against a stubbed
  view. It caught three real defects immediately. `npm i playwright` first.

### Genuinely open — ask Nick, don't assume

1. **⚠ TABLETOP TILT — the live thread, and where to pick up.** Nick had GPT
   build a static 3D-tabletop mockup (`perspective` + `rotateX` on the runs,
   Brig as a middle strip *between* the two run rows, wood-lip edges, opponent
   rail as bordered plaques). **He approved the direction explicitly** — "i
   really do like the 3d table foreshortening going on... we should lean into
   that." Two pieces already landed (opponents' HOLD strip, empty-run "A or Q").
   The tilt/perspective itself is **not started**.
   - He knows the tilt only animates under a mouse and **is fine with that** —
     static is enough until a possible Three.js/native rebuild ("...anyhoo").
   - **`Draw Cards` placement is NOT settled.** It was reworked into a floating
     pill; his verdict was **"that's not quite what i meant"** and "i thought we
     would change that when we got the table top tilt." He considers the
     hand/draw treatment part of the tilt work, not a separate finished thing.
     **Ask what specifically was off before touching it again.** He also wants
     hand cards "flat, not in a fan," full-width, out from under the HOLD.
   - The mockup file is a throwaway demo shell (~300 real lines inside ~1,300 of
     unrelated `codex-visualization` scaffolding), no data wiring, hand-fan
     hardcoded to exactly 5 cards, tilt no-ops on touch. **Mine it, don't port it.**
2. **`/tv` version of the same 3D direction** — raised by Nick, explicitly
   deferred, zero scope. "Cross that bridge when we get there."
3. **The entry flow is still janky and Nick has said so twice.** Separate URLs
   for `/host` and `/join` bother him; he asked when multiplayer can take over
   root `/` with hot-seat moving to `/hotseat`. **`/hotseat` already exists**
   (redirect in `netlify.toml`); root still serves hot-seat because nothing is
   built to replace it. The splash→menu→create/join shell was sketched on
   2026-08-02 and never approved for building. **This matters more for remote
   players than couch ones** — a couch player is standing next to you, a remote
   player has to be told which URL to type. Not scoped; needs a design pass
   before any code.
4. **Orphaned branch with unmerged work:**
   `origin/codespace-turbo-xylophone-97x757w74prgc7pgg`, last touched
   2026-07-28, ~1,481 insertions **not on `main` or `multiplayer-prototype`** —
   a build-17 hot-seat change to `app/index.html` (King declaration becomes a
   recorded decision), a 779-line `SALTY_SCHOONER_MULTIPLAYER_ROADMAP.md`, a
   soft-stall design doc, and playtest CSVs. Nick was asked keep/merge/discard
   and **has not answered**. Do not delete it without his call.
5. **Remote mode has never been seen on a real phone.** Everything is verified
   by headless render only. Expect a sizing round.
6. **Root cause of the socket drops is still unconfirmed** — the client's
   *response* is now cheap either way, so it is no longer a cost risk, but
   nobody knows why it dropped. The doorbell logs `[play] realtime LIVE/DOWN`
   to the browser console on every reported transition; with the 4s debounce a
   healthy session should print almost none. Checking that needs a desktop
   browser, which Nick has not had to hand.
7. Items 5–6 from the 2026-08-02 HANDOFF (three unratified ⚑ rules questions in
   `docs/RULES.md`, and the provably unsound clinch-check) remain open and
   untouched.

### Where to pick up

Nick's own stated next step is the **tabletop tilt** (open item 1) — it is the
only thing he has actively asked for and left unfinished. Start by asking what
was wrong with the Draw Cards pill, since that answer shapes the hand layout the
tilt work has to accommodate.

**Before any visual work: `npm i playwright` and run `node scripts/shoot-play.js`.**
Looking at the render first is now the established loop here, and it has a
three-for-three record of catching things reading the code did not.

---

## 🟢 REMOTE MODE BUILT (2026-08-10) — /play draws the board when there is no TV

**Not yet playtested or deployed.** Built, parses, regression suite green; nobody
has looked at it on a phone. Expect a sizing round — every visual pass in this
project has needed one.

**What was already there, contrary to the older notes:** the couch/remote
**toggle already existed** in the Menu (`mCouch`/`mRemote` → `setDisplayMode`),
and `render()` already showed run cards in remote mode. What was missing was the
layout it switched into — so flipping to remote gave you a landscape couch
controller with cards in the Runs and everything else still hidden. The
2026-08-02 note ("the couch/remote switch is per-device only") described the
switch as built; it is the *room-level default* that was never built, not the
switch. **Still true: the default is hardcoded `'couch'` per device.**

**Approach — one DOM, two layouts, CSS only.** Remote is a portrait re-flow off
a `data-mode` attribute, not a second markup tree and not a second page. Same
reasoning that moved the lobby onto `/play` in the first place: duplicating the
playing UI guarantees the copies drift. Every handler, render branch and
optimistic-play path is shared. **Verified in the diff that not one
non-mode-scoped CSS rule was added — couch mode is provably untouched.**

- **Units:** couch sizes cards in `dvh` (landscape → height is scarce). Portrait
  inverts that, so remote sizes anything that must fit ACROSS the screen in
  `vw`. Do not unify these.
- **`data-mode` is set on BOTH `#gameUi` and `body`** — the Port fan and modals
  are fixed overlays and siblings of `#gameUi`, so a `#gameUi`-scoped selector
  cannot reach their card sizes.
- **Rotate prompt is now mode-aware.** It was unconditional; remote is drawn for
  portrait, so arming it there would demand rotating into a layout that does not
  exist. It also gained a **"No TV? Play in remote mode" button** — that overlay
  sits at `z-index:60` over the whole screen, so while it is up the Menu beneath
  it cannot be tapped, and a TV-less player would otherwise have to rotate into
  couch mode (which deliberately shows no board) to find the switch.
- **The public Brig is now drawn in remote mode.** Couch leaves that frame empty
  unless the Kings are yours to play, because `/tv` carries the waiting ones.
  With no `/tv` that hides public state from the one player who cannot get it
  any other way. Waiting Kings render **without `data-jb`** — they are not
  yours, and the missing attribute is what makes tapping them inert, rather than
  a check someone could later forget.
- **Overflow guarded up front**, since deck size is one deck PER PLAYER (24
  Kings possible at 6 players — the arithmetic that overflowed `/tv`'s Brig on
  2026-08-07): the waiting preview is capped at 6 with `brigCount` carrying the
  true number, released Kings are *not* capped (all must stay tappable) and
  scroll inside the frame instead, and `#gameUi` scrolls as a last resort.

**Known gap, deliberate:** remote players see opponents only via Menu → Scores,
matching the pre-rebuild version. `/tv` shows every seat's HOLD count at a
glance; remote costs a tap. Revisit if it annoys in real play.

**2026-08-11 — GPT mockup reviewed, two pieces landed, one deferred on purpose.**
Nick had GPT build a static 3D-tabletop mockup (`perspective`/`rotateX` on the
runs+Brig, fanned/rotated hand cards, opponent rail as bordered plaques). Not
usable as-is — it's a throwaway demo-canvas shell around ~300 real lines, no
data wiring, a hand-fan hardcoded to exactly 5 cards, and its tilt interaction
explicitly no-ops on touch (`if (pointerType === 'touch') return`) — but the
DIRECTION is approved and two pieces were pulled into the real code:
- Opponents' HOLD strip above the Runs (already shipped, see above).
- Empty-run "A or Q" opener text, now in BOTH modes (already shipped, see above).

**Draw Cards was reworked into a floating pill** (`position:absolute` over
`#handSection`, pulled out of `.handInner`'s flex flow so `.handRow` claims
full width whether the pill is shown or hidden) — but **Nick's read, after
seeing it: "that's not quite what i meant."** He said leave it rather than
iterate now, because he considers this bundled with the still-undone
**tabletop tilt** work (`perspective`/`rotateX` on the runs, likely restoring
the Brig-as-middle-strip layout from the mockup) — the two were one idea in his
head, not two, and the hand/draw treatment should be revisited alongside that,
not treated as separately finished. **Do not consider Draw Cards' placement
settled** — ask what specifically was off before touching it again.

**Also raised, explicitly deferred:** whether `/tv` gets a version of the same
3D-tabletop direction. Zero scope yet — "cross that bridge when we get there."

---

## 🔴 INCIDENT + FIX (2026-08-09) — a flapping socket set the poll rate

**Symptom Nick reported:** the game "feels like it's struggling" — phone taps
inconsistently laggy, `/tv` updates sometimes fast and sometimes slow. Notably
he said it felt *worse* than before the 2026-08-07 latency work, not better.

**What it actually was, measured against production** (Supabase request logs,
not inferred): `/play` was fetching state **~2×/second, sustained** — including
an 11-minute stretch when nobody was playing at all, while he was typing
messages. **~7,200 invocations/hour against a 125,000/month cap: roughly 6% of
the month per hour of play.** The poller's backoff never engaged once.

**Root cause — three defects compounding:**

1. **`onLiveChange` was wired to `poller.refresh()`** on both `/play` and `/tv`.
   `refresh()` fetches immediately *and* resets the backoff. So every Realtime
   connect/disconnect edge forced a fetch and wiped the slowdown. A socket
   flapping once a second therefore produced ~2 fetches a second, and the
   carefully-tuned `intervalFor()` rates were never consulted by anything.
2. **The reconnect backoff could never grow.** `retries` was reset to 0 on every
   `SUBSCRIBED`, but the connection was dying immediately after subscribing — so
   the counter reset every cycle and the client retried at the first backoff step
   (1s) forever, with no ceiling and no give-up.
3. **`teardownChannel()` was not awaited**, and the replacement channel reused
   the same topic name. `removeChannel` is async, so a new subscription could
   collide with the not-yet-departed old one under the same key — plausibly the
   thing *causing* the drops in (2), and self-sustaining once started.

**Fixes (all four files, plus a test):**

- **`poller.js`** gains `reschedule()` — recompute the delay, fetch nothing,
  touch no backoff — which is what a connection change actually needs. Both
  screens now call it instead of `refresh()`. `schedule()` became deadline-based
  (`lastPollAt + delay`) so repeated rescheduling is idempotent and can neither
  pull polls forward nor starve them. All forced-fetch paths funnel through one
  `forceTick()` with a **`minForcedGapMs` floor (900ms)** — the backstop that
  caps cost no matter which caller misbehaves. `tick()` gained a concurrency
  guard so a forced poll can't overlap an in-flight one.
- **`realtime.js`**: going DOWN is now **debounced by `downGraceMs` (4s)** —
  a blip that heals costs the screen nothing, so announcing it only causes
  churn; coming UP is still announced immediately. `retries` is now forgiven
  only after a connection **holds** for `stableMs` (15s) or actually delivers a
  message. `teardownChannel()` is awaited and channel topics carry a unique
  suffix.
- **`play.html`**: a general `actionInFlight` flag now covers **every** action
  POST via `withActionLock()`. Previously only optimistic run plays were
  guarded, so a double-tap on Draw or a Port fired a second request that the
  server's compare-and-swap correctly refused — costing an invocation and
  showing the player "someone else already acted" for their own double-tap.
  Swallowed taps now call `noteBusyTap()` (soft cue, plus a toast on repeat)
  instead of being **silently** dropped, which is what made a normal network
  wait indistinguishable from a dead app.

**`scripts/test-flap-cost.js`** runs the real `poller.js` + `realtime.js` wired
as `/play` wires them, on a stubbed clock and socket. Written and **run against
the old code first** (repo convention): it reproduced **7,206 fetches/hour**
against the ~7,400/hour measured in production, and showed reconnect gaps pinned
flat at 1000ms. After the fix: **84/hour**, gaps escalating 1s→2s→4s→8s→16s→30s.
It also asserts a *genuine* outage still falls back to fast polling — the fix
must not buy cheapness by going deaf.

**Standing rule this adds — `kick()` vs `refresh()` vs `reschedule()`:**
`kick()` = a human acted (fetch now, defer idle-stop). `refresh()` = machinery
wants fresh data (fetch now, do NOT defer idle-stop). `reschedule()` = the base
rate changed (fetch NOTHING). These three look interchangeable and are not;
picking the wrong one has now caused two separate cost incidents (the 17-hour
`/tv` poll, and this). **Only news about the GAME may cost an invocation** — a
connection changing state is not news about the game.

**Not yet verified in real play.** Everything above is proven by test and by
code reading, not by a playtest. The open question is *why* the socket was
dropping in the first place — the fixes make the client's response to drops
cheap and correct regardless, but the underlying drop cause is unconfirmed.
The doorbell logs `[play] realtime LIVE/DOWN` to the browser console on every
**reported** transition; with the 4s debounce in place, a healthy session should
print almost none.

---

## 🟢 HANDOFF (2026-08-07, end of session — read this first)

Context window filled up; this is a deliberate stopping point, not a natural
break. Everything below is verified against actual repo/production state at
write time (git log, live curls against the deployed site, direct Supabase
queries against production data), not recalled from memory.

### Deploy state right now

```
git status: clean, nothing uncommitted
HEAD and origin/multiplayer-prototype both at e2051d0
Production is serving e2051d0 — verified by curling the deployed /tv and
/shared/poller.js for code that only exists in this commit.
```

Nothing pending. No further push/deploy needed to pick up where this left off.

### What shipped this session, in order

1. **`/play` controller polish** — bigger hand cards, HOLD card resized twice
   (first too small, then too big, settled at 10dvh — 62% of its frame), Port
   badges resized twice (3x was too loud, backed off to ~2x), HOLD/Brig frames
   made square (they were stretching a square frame asset into a non-square
   box), runs enlarged, Menu moved into the turn bar and then to its left end,
   turn bar fixed at 600px so the logo has room to actually read.

2. **Tap-latency fix on `/play`** — `selectCard()` was calling full `render()`
   (a complete innerHTML rebuild of the whole board) for a purely local,
   zero-network selection change. That was cheap before the restyle, expensive
   after it. Fixed with `paintSelection()`, a targeted class toggle. Measured
   4x median improvement, worst-case spike eliminated.

3. **Scoped optimistic play** — tapping a Run now fades the source card and
   rings the target immediately, before the server responds, then reconciles
   with whatever comes back. Deliberately does NOT fake `lastView` — a
   rejected play just fades back in, never shows a board that disagrees with
   the server. Kings/discard/draw excluded (Kings need a modal anyway; the
   others have server-side consequences the client can't safely predict).

4. **Netlify quota incident** — found and killed a `/tv` screen that had been
   polling a dead LOBBY once/second for 17 hours (~61,000 invocations, roughly
   half the monthly cap, on the 7th of the month). Root cause: `poller.kick()`
   (which defers the 20-minute idle-stop) was wired to the Realtime
   connect/disconnect handler, so a flapping socket reset the abandonment
   timer forever. Fixed with a `refresh()`/`kick()` split — `kick()` now means
   "a human did something," `refresh()` means "machinery triggered this" and
   does NOT defer idle-stop — plus a hard 90-minute stop measured only from
   the last real state change, which nothing can defer. **Getting the
   kick/refresh distinction backwards is exactly what caused this incident —
   read the comments in `app/shared/poller.js` before touching it.**

5. **`/tv` full redesign** per `docs/TV_REDESIGN_SPEC.md` (spec is in the repo,
   read it for full detail). Player rails now run down BOTH sides (was one
   column on the right, couldn't fit 6 players without overflowing). Four
   independent Run lanes around a centered Brig, replacing one big parchment
   panel that claimed all available height regardless of how few cards were on
   it. Run card overlap is *measured* against available lane width rather than
   guessed from a card-count formula — Runs have no maximum length, since a
   King can reverse a Run's direction and send it bouncing indefinitely. Hold
   card enlarged then reduced 15% at Nick's request. SCORE row was DROPPED
   from plaques to make room for the bigger Hold card. **This contradicts
   `docs/TV_REDESIGN_SPEC.md`, which still requires score on every plaque and
   a "NEEDS X OF SUIT OR Q" hint under each Run (also killed, per Nick: "no
   hints, that was clarified after the mockup was made"). The spec doc itself
   has not been edited to match either decision — do that if you're back in
   this doc for other reasons, or just know the doc is stale on these two
   specific points.**

6. **`/tv` render latency** (final fix, commit `e2051d0`) — `/tv` was getting a
   Realtime push saying "something changed," then making its OWN separate
   `get-public-state` fetch to find out what — a full extra ~250-300ms round
   trip on top of however long the play itself took, fetching data that was
   already public. Fixed by embedding a public board snapshot directly in the
   `room_pulse` row (new nullable `public_state` jsonb column via
   `buildPublicSnapshot()` in `lib/views.js`), so `/tv` renders straight off
   the push. **This REMOVES a function invocation per action per watching TV
   — it does not add one**, which mattered given the quota situation above.
   Verified on live production: the embedded snapshot has zero private data
   (no hands, no Ports, no tokens) and is byte-identical in shape to what a
   real fetch returns.

7. **Brig overflow fix** (same commit) — deck size is one full deck PER
   PLAYER (`engine.js` `makeDeck`), so a 6-player game has 24 Kings possible.
   Nick saw 7 pile into the Brig during real play and they ran off the edge of
   the frame. Root cause: the King row was missing `min-width:0`, so it sized
   to its own content and ballooned past its container — same class of bug
   `.runCards` already had a fix for. Now measures and shrinks Kings to fit
   one row, falling back to wrap if even the size floor can't hold them.
   Verified at 1, 3, 7, 12, 24, and 40 Kings.

### Standing conventions from this session — follow without re-deriving

- **`kick()` vs `refresh()` on the poller is load-bearing.** `kick()` = a human
  did something, defers idle-stop. `refresh()` = machinery (socket
  reconnecting, tab visibility), does NOT defer idle-stop. Mixing these up
  caused the 17-hour polling incident above.
- **`room_pulse` may ONLY ever carry `buildPublicSnapshot()`'s output.** That
  table broadcasts to anyone with the Supabase publishable key. Never widen it
  to include a hand, Ports, or any token — that is the one hard privacy
  boundary in this whole pulse/doorbell system.
- **The direction wash on Runs (green=up, red=down) is NOT a legality hint.**
  It's public state already shown on `/tv` and doesn't depend on what's in
  your hand — the no-legality-hints rule on `/play` still holds, this doesn't
  violate it, don't let the two get confused.
- **Nuking the DB is fine for this project.** Nick, this session: "these games
  aren't real... if a game has to be killed off to protect my usage limits,
  that's fine." Don't be precious about test/game data here.
- Every other standing convention from the 2026-08-02 HANDOFF below still
  holds (no legality hints on `/play`, hot-seat frozen, `/admin` PIN `allure`,
  rules changes need a test against old code first, etc.) — this session
  didn't change any of those, just added the ones above.

### Genuinely open — ask Nick, don't assume

1. **Player-selected colors on `/tv`** (spec §7). Plaques already call
   `safePlayerColor(player)`, which prefers a validated `p.color` and falls
   back to a deterministic per-seat color — so what's left is scoped to the
   server/join side only: a `player_color` column, uniqueness enforcement
   (`UNIQUE(room_id, player_color)`), `/join` UI to pick one, threading it
   through the views. Plaque rendering needs no further changes.
2. **`docs/TV_REDESIGN_SPEC.md` is stale** on the two points in item 5 above
   (Run hints, plaque score) — not yet amended to match what actually shipped.
3. **Nick wants to adjust the Brig's look "at some point."** If so:
   `frame-brig.png` is a 512x512 SQUARE asset drawn at `100% 100%` — any
   non-square box stretches it, the same trap that broke the old player
   plaques. `.brigInner` is sized to 76% specifically because 70% clipped the
   caption and wrapped Kings onto two rows — empirically tuned, re-derive if
   the art changes.
4. **Portrait remote-mode `/play`** — parked explicitly, see the
   `salty-schooner-polish-backlog` memory (outside this repo). Pre-rebuild
   reference version is at git commit `d0fdcc2~1`. Two fidelity options were
   discussed and Nick deferred the CHOICE, not just the timing.
5. Items 5-6 from the 2026-08-02 HANDOFF below (unratified rules ⚑ questions in
   `docs/RULES.md`, and the unsound clinch-check) are both still open and
   untouched by this session.

### Where to pick up next

No explicit next task was queued. The last open loop: Nick had not yet
playtested whether the `/tv` and `/play` latency fixes actually feel better in
real play — that's the natural first thing to check in on.

---

## 🔵 SUPERSEDED — 2026-08-02 HANDOFF
**Everything actionable in the section below shipped during the 2026-08-07
session above (`/play` polish, tap-latency fix, optimistic play, the polling
incident and fix, the full `/tv` redesign, and the `/tv` render-latency +
Brig-overflow fixes). Kept for historical context — its own "genuinely open"
list is stale; the 2026-08-07 HANDOFF above has the current one. Its internal
sub-sections (like the "host-as-a-seat" planning notes further down) were
already marked superseded within this same block back in August.**

## 🟢 HANDOFF (2026-08-02, end of session)

Context window filled up; this is a deliberate stopping point, not a natural
break. Everything in here is verified against the actual repo/production state
at write time, not recalled from memory.

### Deploy state right now

```
git status: 2 commits ahead of origin (NOT pushed)
  d0fdcc2  Rebuild /play as the landscape controller from Nick's mockups
  61f148a  Note the Three.js idea and the couch-mode phone layout as parked

Production (salty-schooner.netlify.app) is running an OLDER build:
  - engine.js:  prod MATCHES local — the round-end rule (entry 24) IS live.
  - play.html:  prod DIFFERS from local — the controller rebuild is NOT live.
  - root '/':   still serves hot-seat (v26 title), unchanged.
```

**To catch production up:**
```bash
cd ~/repos/salty-schooner
git push origin multiplayer-prototype
netlify deploy --prod --build
```
Nothing risky in that push — both pieces were verified against real rooms
before committing (see the commits themselves for exact verification steps).

### What got built this session that this file's older sections do not reflect

The "NEXT SESSION — host-as-a-seat + game shell" section right below this one
is now **stale** — it was written mid-session when none of it existed. Almost
everything in its Stage 1 is done (see entries 22–24 further down and the
commits below). Do not follow its "genuinely open" list; follow this one.

Built, tested against live rooms, and committed — **not yet pushed or deployed**:

- **`/tv` fully restyled to Nick's mockup** (commit `1445893` + fixes in
  `e1e702f`, `37cc7a8`): one unified parchment Runs panel with dividers, the
  Brig as a compact square using `frame-brig.png` at last (it's 512×512 and the
  old 10:1 Brig bar would have smeared it), player plaques in `frame-hold.png`
  down the right, the logo filling the space beside the Brig, no on-screen log
  (still fetched — the Jailbreak sound cues derive from diffing it, see entry
  in the code comments). Sizing moved from `clamp()` px ceilings to `vh`, since
  `/tv` is a 16:9 television essentially always — a 4K panel was previously
  capped at ~40% of its actual size. **Two real bugs fixed along the way, both
  worth knowing about because they are easy to reintroduce:**
  - The board artwork (`board-bg.webp`) was invisible on every screen, not just
    `/tv`. `theme.css` paints an **opaque** navy on `body`, and CSS draws a
    negative-`z-index` pseudo-element **before** its parent's background paints
    — so `body` was covering `.saltyBoard::before` everywhere. Fixed on `/tv`
    and `/play` by setting `body { background: transparent }` and re-declaring
    `.saltyBoard::before` locally. **`/host` and `/join` still have this bug** —
    nobody has fixed it there because nobody asked yet.
  - The Brig's shake-and-glow build-up animation targeted `.brigBar` in CSS
    after the element's class was renamed to `.brigBox` — the `id` stayed the
    same so the JS kept firing and nothing errored, it just silently never
    played. Selector now matches.
  - The 16:9 Jailbreak splash art Nick supplied was a 25.9MB PNG at 5504×3072 —
    resized to 3840w and re-encoded to a 1.3MB JPEG (`jailbreak-tv.jpg`),
    `object-fit` switched from `contain` to `cover`.

- **`/play` rebuilt as a landscape controller** (commit `d0fdcc2`), built to
  three mockups Nick drew, iterated round by round:
  - **Landscape only**, sized in `dvh` so the whole board fits one screen with
    zero scrolling — an explicit requirement. Portrait shows a rotate prompt.
  - **Runs are bare tap targets with NO legality highlighting** — no glow, no
    card contents in couch mode. **This is a deliberate philosophy, not a
    half-finished feature: Nick said pre-highlighting legal plays "takes all
    the skill away."** Do not add it back without him asking. Illegal plays
    still toast; the server was always the real authority, so nothing in
    `engine.js` changed for this.
  - **King direction is now a dimmed-backdrop modal**, replacing the old docked
    `choiceBar` — the new layout claims every region of the screen, so there is
    no free strip left for a docked bar to occupy without covering something.
  - **New Menu modal** (tap "Menu ☰") holds everything that is not a card play:
    live scoreboard, the couch/remote display-mode switch, a sound on/off
    toggle, and — for the host only — Reset Game and a link to `/admin`. Nick
    was explicit that host controls belong here now, not in a separate corner
    button, since "I'm likely to be the only actual host for a while."
  - **The Brig panel fills only during YOUR OWN Jailbreak** — released Kings
    exist solely on the turn of whoever triggered it, and that Jailbreak always
    resolves (success or Curse) at the same discard that ends the turn, so no
    other player's turn can ever overlap an open one. `isYourTurn && brig.active`
    is the whole condition; no new per-player state was needed.
  - **⚠ INCOMPLETE, flag this clearly:** the couch/remote switch is
    **per-device only**, defaulting every device to `'couch'`
    (`localStorage`, no server involvement). The originally discussed design
    — *host sets the room's default, any player can override their own
    device* — was never built. Right now every new device silently starts in
    couch mode regardless of what the room actually needs (e.g. a solo remote
    player would have to know to open the Menu and flip it themselves). Confirm
    with Nick whether the hardcoded default is fine to leave as-is or whether
    the room-level default still needs building.

### Genuinely open — ask Nick, don't assume

1. **The entry flow (splash → menu → create/join) — sketched in detail this
   session, Nick said "sure, sketch it" but explicitly has NOT said "build it".
   Zero code written.** The proposed shape, modelled on Nick's other game
   (Make It Terrible / `github.com/NickBlackhall/studio`) but deliberately
   trimmed:
   - Splash (full-bleed art + one button) → Main Menu (two cards: **Play**,
     **Settings**) → Play opens a choice of just **Create Game** / **Join
     Game** (today's `/host` and `/join` forms, relocated behind this) →
     existing Lobby on `/play` (already built, no new work needed there).
   - **Deliberately NOT copying** from Make It Terrible: Browse Public Rooms
     and Quick Join (Salty Schooner has no public-room concept — it's
     code-shared, not matchmade) and their ready-toggle-per-player gate on
     Start (Salty Schooner still just checks headcount).
   - Settings screen should mostly reuse the in-game Menu's existing sound
     toggle and `/admin` link rather than building a second settings system;
     "How to Play" would be genuinely new content (hot-seat has a rules
     explainer, multiplayer has none).
   - Architecturally: **one new static page with JS-toggled sections**, same
     pattern as `/play` and `/tv` — not a single-page-app state machine like
     Make It Terrible's, since nothing else on this site works that way.
   - This is also what finally lets root `/` stop serving hot-seat — don't
     touch that redirect until this exists to replace it (per the standing
     note further down in this file).
2. **Nick's reef/turquoise background asset** — mentioned twice, never
   dropped into `app/assets/`. Both `/tv` and `/play` currently fall back to
   the old `board-bg.webp`. One-line swap once it lands; ask if it's been
   provided yet before assuming it hasn't.
3. **Telemetry** — Nick confirmed (2026-08-02) he wants it for real, not a
   placeholder. Multiplayer has zero telemetry today. Still not started,
   deliberately deferred as its own stage. Do not build ad hoc alongside
   something else.
4. **Three ⚑ items in `docs/RULES.md`, unratified since it was first
   written** — Run 1's non-Ace/Queen opener, Curse penalties being able to
   un-win a round, a second Jailbreak reachable in one turn. Nobody has asked
   Nick to rule on these; they are not blocking anything, just sitting open.
5. **The clinch-check is provably unsound** (`docs/RULES.md` §17 in spirit —
   search WORKLOG for "clinch ceiling"): it assumes a max round score that
   Curse penalties can exceed, so the game can claim someone is "mathematically
   uncatchable" when they are not. Unfixed. Needs Nick's call on the approach,
   not just a patch.
6. **Three.js** — explicitly parked by Nick ("keep it in mind"), same standing
   as the Jokers mechanic. Do not start unprompted.

### Standing conventions this session established — follow them without re-deriving

- **No legality hints, anywhere, ever, on either screen.** This is a
  considered philosophy (preserves skill), not an oversight to "fix."
- **The host is always a player. There is no seatless-host mode any more** — it
  was built, tried end-to-end, found to strand the host with "No saved seat
  found", and deliberately removed same-day. Don't reintroduce it.
- **Rules changes need a test written and run against the OLD code first**, to
  prove the test actually catches the reported problem before trusting it to
  verify the fix. Worked cleanly twice this session (`test-draw-rule.js`,
  `test-round-end.js`) — keep doing it.
- **Hot-seat (`app/index.html`) stays completely frozen.** It is now three rule
  changes behind multiplayer, deliberately (refill, draw payout, round-end).
  Do not resync it without Nick asking.
- **Reuse hot-seat's existing assets and CSS rather than inventing new visual
  language** — every restyle this session (`/tv`, `/play`) pulled from
  `app/assets/` and `app/index.html`'s existing rules rather than designing
  from scratch. Check there first.
- **`/admin` PIN is `allure`.** Short and memorable by Nick's explicit choice —
  only sound because of the 5-attempt/15-minute lockout in `admin_guard`. If
  that lockout is ever removed, the PIN must become a long random secret again.
- **The biggest untested thing remains round-end.** Nobody has played a full
  round to completion on any build since the round-end rule changed or the
  controller was rebuilt. If something breaks on a real playtest, that is the
  first place to look.

---

## 🔵 SUPERSEDED — host-as-a-seat + game shell (planning only, nothing built)
**Everything in Stage 1 below is now done — see the HANDOFF section above.
Kept for historical context only; do not treat its "genuinely open" list as
current.**

Nick hit a usage limit mid-discussion, so this is written down before context is
lost. **No code exists for any of this yet.** Read this whole section before
starting.

**Confirmed decisions (Nick, 2026-08-02):**

1. **The host is a player, not a separate control panel.** Today `/host` has no
   hand and never plays — that's the thing being fixed. Borrowing the shape from
   Nick's other game, Make It Terrible: splash ("tap to continue") → main menu
   (settings/sound, a link to `/admin`, **Play Now**) → **Play Now** opens a
   **Create Game / Join Game** choice → Create Game shows the match settings
   (rounds, HOLD cards per player, **and a new max-players setting**) → creates
   the room → lobby. Host taps Start, and from that point on the host is an
   ordinary player on `/play` — same hand, same controls as everyone else —
   with a small extra: an in-game menu item that jumps to `/admin` (still
   PIN-gated), so the host keeps a way to manage the room without a second
   device.
2. **Root `/` moves.** `app/index.html` (hot-seat, frozen at v26.16) currently
   occupies the site root. Nick decided **hot-seat should move to its own URL**,
   since it is no longer the main game — freeing up `/` to become the new
   splash/menu shell described above. Exact new hot-seat path (`/hotseat`?
   something else?) was not chosen yet — ask Nick, or propose one and confirm
   before moving the file, since `docs/RULES.md` §14 and `AGENTS.md`'s authority
   order both reference `app/index.html` by path and would need updating too.
3. **QR code is explicitly deferred.** Don't build it. The lobby keeps showing
   the room code as text for now; `/join` still works exactly as it does today.
4. **Build in stages, not one pass.** Nick agreed to this explicitly but we ran
   out of time to fix the exact stage boundaries. Proposed (not yet
   re-confirmed) split:
   - **Stage 1 — the functional core:** root becomes the splash→menu→create/join
     shell; hot-seat moves off root to its own path; host-as-seat on `/play`;
     max-players becomes a real setting instead of the hardcoded constant in
     `netlify/functions/join-room.js` (`MAX_PLAYERS = 6`).
   - **Stage 2 — in-game menu:** the menu itself (doesn't exist on `/play`
     today), a sound on/off toggle (`/play` has no mute control today — only
     `/tv` does), the `/admin` shortcut.
   - **Stage 3 — QR code**, whenever it comes back into scope.
   - Telemetry appeared in Nick's description of the settings menu
     ("game telemetry") but **multiplayer has no telemetry system at all today**
     (hot-seat's `Telemetry` object doesn't extend to `/host`, `/play`, `/tv`,
     or the functions). This is a real open question, not a small toggle —
     confirm with Nick whether the menu should (a) have a placeholder entry with
     no function yet, (b) actually port a telemetry system, which is a
     meaningfully separate build, or (c) not mention it until built.

**Genuinely open, unanswered — ask before writing code:**
- **Max-players cap.** Today's hardcoded limit is 6. Raise it, keep it, or make
  it Nick's call per room within some ceiling? Not decided.
- **Telemetry scope**, per above.
- **Exact new path for hot-seat.**

**Facts checked this session, so the next one doesn't have to re-verify:**
- `app/index.html` is the only thing at the site root right now — there is no
  existing multiplayer landing page to repurpose. Confirmed by listing
  `app/*.html`.
- `/play` has zero menu/settings/sound-toggle UI today — confirmed by grepping
  `app/play.html` for `menu|settings|hamburger` and `mute|sfxEnabled|sound`
  (only the `sfx.js` `<script>` tag matched, no actual toggle).
- `/tv` **already** renders the lobby view (`getLobbyView`) — this was one of
  Nick's requirements and needs **no new work**.
- `MAX_PLAYERS = 6` lives in `netlify/functions/join-room.js:7`, a bare
  constant, not part of `config`/`normalizeMatchConfig`.

**Also on the table from earlier in this session, not yet acted on:**
- **Couch mode vs. remote mode is a per-device rendering choice, not a
  server-side concept** — the server already sends every device the same
  shared-board-plus-private-hand payload; "couch" is a device choosing to hide
  the shared parts because a `/tv` is carrying them, "remote" is a device
  showing both. Mixing modes in one room (e.g. Nick's mother, remote, joining a
  couch game) already works today and needs no code — confirmed during
  discussion, not yet built as an explicit per-device switch. That switch
  (host sets the room's default, any player can override their own device) is
  future work, not part of the three stages above.
- **Couch-mode phone layout, next step:** Nick wants to mock up what `/play`
  should look like with the shared board (Runs, Brig) collapsed for couch mode.
  One fork already agreed: Runs can't disappear from the phone entirely — a
  card still has to be tapped onto *some* run, and a TV isn't touchable — so
  they shrink to compact legality-highlighted buttons (echoing the run areas
  visually, no card art) rather than full tiles; the actual cards live on
  `/tv`. Wait for the mockup before building.

**Raised and explicitly parked (Nick, 2026-08-02): rebuild the board in
Three.js** for real 3D card flips/arcs, a table viewed with depth and dynamic
lighting, and a cinematic camera-driven Jailbreak (push into the Brig, Kings
physically bursting out) instead of the current full-screen splash image.
Genuinely a good fit for a card game, not dismissed — but a large stack change
(3D hit-testing instead of DOM buttons, real GPU load on the phones this has
to run well on, no build step today vs. one then) for a project still mid
functional-buildout with rules only just settling. Nick's own call: "keep it
in mind" for later, once rules and layout stop moving. **Do not start this
unprompted** — same standing as the Jokers mechanic below.

**Start the next session by re-reading this section, then re-ask the two open
questions (max-players cap, telemetry scope) before writing any code.**

**Progress, 2026-08-02 (resumed session): hot-seat has its own URL.**
`/hotseat` now serves it (redirect in `netlify.toml`, same pattern as `/host`
`/join` `/play` `/tv`). **Deliberately did not rename `app/index.html`** —
that path is required verbatim by `build-drop-zip.sh` (the separate Netlify
Drop workflow) and referenced by path in half a dozen docs; renaming would
have meant updating all of that for a routing change that doesn't need it.
**Root `/` still serves hot-seat too, for now** — Netlify's default-file
behaviour, unchanged — because there is nothing built yet to put there.
**Do not remove that until the new splash/menu shell actually exists**;
pulling it before then would 404 the site's front door with nothing to show.
Verified locally via `netlify dev`: `/hotseat` serves the hot-seat title,
`/` still does too, and `/host` `/join` `/play` `/tv` `/admin` are unaffected.
**Not yet deployed** — needs `netlify deploy --prod --build`.

**Progress, 2026-08-02: STAGE 1 BUILT — the host is a player.** Nick confirmed
max players stays capped at 6 ("a lot of people and a long time in between
turns") and that telemetry is a real feature, not a placeholder — telemetry is
still **not built**, deliberately deferred to its own stage.

- **`create-room` seats the host.** Pass `hostName` and it inserts a seat-0
  player row alongside the room, returning `playerId`/`resumeToken`/`seat`
  beside `hostResumeToken`. If seating fails the room is deleted rather than
  left as a lobby its creator can never join. **`hostName` is REQUIRED** — a
  seatless host was kept as an option for about an hour, then removed once it
  was actually tried end to end: `/play` finds no player credentials and shows
  "No saved seat found" with polling stopped, so that host held a token for a
  room they could not see, with no lobby, no code to read out and no Start
  button. Nick's call to drop it ("I don't see the need"). Every host is a
  player; there is no other kind. A blank or whitespace name is a 400.
- **`/host` is now ONLY the create form** (name, rounds, HOLD, max players) and
  redirects to `/play`. The lobby, Start, round controls and Reset all moved to
  `/play`. **This was the whole point:** `/play` already holds the entire
  playing UI — card selection, King direction, Port fan, discard — and copying
  that onto a second screen would guarantee the two drift apart.
- **`/host` no longer silently resumes.** It offers "you already have a game
  going — ABCD — rejoin it" instead, which also stops a refresh quietly minting
  a second room. Needed a new `Persist.saveRoomCode`/`loadRoomCode`, since
  `roomId` is a uuid nobody recognises.
- **`/play` gained a lobby screen and a results screen.** Round results used to
  be a toast on the phone; everyone now sees the scores, and the host gets
  Start next round / End game now / Reset in place. Host controls key off
  holding a host token for that room — **display only, every host action is
  still re-verified server-side.**
- **`maxPlayers` is a per-room setting**, replacing the hardcoded
  `MAX_PLAYERS = 6` in `join-room.js`. Lives in `lib/rooms.js` (capacity, not a
  game rule) so it stays clear of engine.js's rules-protected `MATCH_LIMITS`.
  Old rooms without the field fall back to 6.

**Verified end to end on `netlify dev`, not just eyeballed:** host created and
seated at seat 0; start refused with only the host seated; `maxPlayers: 3`
refused the 4th joiner; start accepted at 3; the host's own `get-state` returns
a real hand and `isYourTurn`; the host is simultaneously authorised as host.
Authority checked from the outside — a player's token sending `ADVANCE_ROUND`
gets **401**, a non-host reset gets **401**, the host's own gets 200, and the
host's `ADVANCE_ROUND` in the wrong state gets **400** ("no round result is
pending"), i.e. authorised but correctly refused. In the browser: the `/host`
form → redirect → lobby → Start → dealt a hand; a non-host sees no host
controls anywhere; a live join pushed through the Realtime doorbell and enabled
Start with no polling involved.

**Worth knowing for the next session:** the Browser pane's tab reports
`document.hidden === true` while backgrounded, so `poller.js` correctly makes
ZERO requests and nothing renders. That is the invocations fix working, not a
bug — front the tab with `tabs_select` before testing anything poll-driven.

**Not yet deployed. Next stages:** the splash → menu → create/join shell (root
`/` takes over from hot-seat at that point), then telemetry, then the QR code.

## 🟡 READ FIRST — site restored, adaptive polling deployed (2026-08-01)

**The site is serving again** (billing period rolled over Aug 1 and Netlify
lifted the pause on its own) **and `netlify deploy --prod --build` has been run,
so production finally has the adaptive poller.** Verified by curl, not assumed:
`/shared/poller.js`, `theme.css` and `sfx.js` all return 200; all three screens
load `poller.js`; the flat `setInterval(poll, 800)` is gone from production
`/play`; production `poller.js` is byte-identical to the local file; and
`/api/get-public-state` returns a JSON function-level error, so functions
survived the deploy.

**Note this promoted more than the polling fix**, by Nick's explicit approval on
2026-08-01: the styling pass, the hand-refill rule change (entry 16), the Port
fan and the four controller fixes (entry 18), and sound all went live in the
same deploy. Production and `multiplayer-prototype` now match. The "production
is stale" warning that used to live here no longer applies.

**✅ The cost problem is FIXED AND DEPLOYED (2026-08-02).** Entry 21's Realtime
doorbell is live: verified on production that `/shared/realtime.js` and the
vendored bundle return 200, all three screens load them, and a room created
against the live API rang the doorbell to an outside subscriber — while that
same subscriber was refused on `rooms` and `players`. A 2-hour session should
now cost a few thousand invocations rather than ~18,000.

**Still undeployed:** entries 22 (draw-rule change) and 23 (`/admin`). Promote
with:
```
cd ~/repos/salty-schooner && netlify deploy --prod --build
```
`/admin` also needs the `ADMIN_PIN` env var, which is already set on the site.

**Still do this every session:**
- Close any Salty Schooner browser tabs — yours or an agent's — pointed at a
  deployed URL before ending a session. See `[[browser-tabs-cost-real-money]]`
  in Claude's memory. `localhost`/`file://` tabs are free; `*.netlify.app`
  tabs are not. The hidden-tab pause now makes a backgrounded tab free, but a
  *visible* forgotten tab still polls.
- Prefer `curl` over opening a browser tab when checking production state.

## ⚠ READ FIRST — two things changed structurally

1. **`docs/RULES.md` is now the rules authority**, not `app/index.html` and not
   `reference/`. It is NOT yet ratified by Nick — three items are flagged `⚑`
   for his review. `AGENTS.md`'s authority order was corrected: it previously
   pointed at `reference/`, whose only prototype is **v11**, which the
   multiplayer roadmap explicitly calls historical. Following the old list would
   have led an agent to "correct" the game *backwards*.
2. **`app/index.html` (hot-seat) is FROZEN at v26.16 by Nick's decision
   (2026-07-29)** and now **deliberately differs on hand refill** — see entry 15.
   Do not resync the multiplayer engine to match it on that rule.

## Current state

- **Two apps in one repo, both on `main`'s successor branch `multiplayer-prototype`:**
  - **Hot-seat:** `app/index.html` (v26 "Tappable Runs") + `app/assets/`. Frozen.
    Tagged `v26.16-hotseat-baseline`.
  - **Multiplayer:** `/host`, `/join`, `/play`, `/tv` + `netlify/functions/`.
    Shared TV screen with private phone controllers, server-authoritative.
- **Repo:** github.com/NickBlackhall/salty-schooner. Active branch
  **`multiplayer-prototype`** (pushed). `main` still holds the hot-seat baseline.
- **Rules engine:** `netlify/functions/lib/engine.js`, ported from
  `app/index.html`. `app/shared/engine.js` is a **byte-identical copy** served to
  browsers for legality hints — keep the two in sync (`cp` after any edit).
- **Backend:** Supabase project **BMG Social** (`qbkcnjlshkckpkoiavje`), schema
  `salty_schooner`, tables `rooms` + `players` + `room_pulse`. Not the paused
  "Make it terrible" project. Service-role key is set as a Netlify env var.
  - `rooms` and `players` are **unreachable** with the publishable key that now
    ships to browsers — no table grant AND RLS with no policies. `room_pulse` is
    the one deliberately-readable table and holds nothing secret (entry 21).
    Keep it that way: it is what stops every player reading every hand.
- **Deploy:** now `netlify deploy` from the repo (site `salty-schooner`,
  salty-schooner.netlify.app). The old Netlify Drop zip workflow below applies to
  the **hot-seat** build only.
- **✅ PRODUCTION IS CURRENT (verified 2026-08-01).** ~~PRODUCTION IS STALE~~ —
  resolved. Nick approved promoting the whole branch, so live production now has
  the styling pass, the hand-refill rule change, the Port fan, the four
  controller bug fixes, sound, and the adaptive poller. Production and
  `multiplayer-prototype` match. Note the visual pass reached production without
  ever getting the draft-URL review it was being held for — Nick accepted that
  tradeoff to get the polling fix out. **If the styling looks wrong in real play,
  that is why, and it is a revert, not a mystery.**

## Single-source-of-truth rule (important)

The game drifted from v11 to v26 with nothing in between preserved, because builds were
edited **outside git** and pushed straight to Netlify. To prevent recurrence:

- Every new build lands in `app/` and is committed to `main`.
- Whoever produces a build (Claude or ChatGPT) must land it there — do not fork the game into a separate folder.
- If Nick uploads a newer build as a loose folder, fold it into `app/` and commit.

## Deploy workflow (Netlify Drop)

1. After any change to `app/`, rebuild the zip: `./build-drop-zip.sh`
   - Produces `salty-schooner-app.zip` at the repo root (gitignored; ~19MB).
   - `index.html` sits at the archive root — required by Netlify Drop.
2. Nick downloads that zip from the VS Code Explorer (right-click → Download).
3. Nick drags the zip onto https://app.netlify.com/drop → gets a new random URL.
4. **Keep the zip current:** regenerate it whenever `app/` changes.

## Rules decisions ratified by Nick (2026-07-20)

- **King opener = re-deal.** A King can never be the opening card; if drawn it returns to the deck, the deck reshuffles, and another is dealt. The old "wildcard anchor" opener code was removed.
- **Failed Jailbreak / Curse of the Crown:** unplaced released Brig Kings are **reshuffled into the draw deck** (the old permanent "Davy Jones's Locker" was removed), so the King supply keeps circulating. Penalty = **1 card per unplaced King** to the goal (HOLD) pile bottom. Penalty cards are drawn BEFORE Kings are returned, so a returned King can't be dealt back out as a penalty. The Key King and any placed Kings stay on their runs (no rollback — this is v26's model, not the brief's old rollback).
- **Recycle pile:** completed-run non-King cards go to a recycle pile that is shuffled into a new draw deck when the deck exhausts. Ratified (it fixes a real deck-exhaustion case).

See `MASTER_PROJECT_BRIEF.md` for the full rule text and the King-supply/shuffle audit section.

## Playtest Tracker (added 2026-07-20, upgraded to per-game records same day)

- In-game **MENU (☰) → 📊 Tracker**. Client-side only, persisted in `localStorage` (key `saltySchoonerTrackerV2`).
- **Per-game records:** each game stores start/end time, players, rounds config, winner, final scores, and its own stat counts (King-opener re-deals, runs completed, deck recycles, jailbreaks triggered/succeeded/failed, failed-jailbreak Kings, curse penalty cards, hard stalls). The panel shows lifetime totals (summed across games) plus a recent-games list.
- **Buttons:** Copy all (JSON), Copy games (CSV), Download CSV, Import/restore (paste a prior export — merges, deduped by game id; also absorbs the old V1 aggregate blob as a "legacy" record), Reset.
- **Persistence reality:** survives closing the tab/browser on the same device+URL. Does NOT survive: a new Netlify Drop URL (new build = new origin = empty), a different device/browser, clearing Safari data, or iOS ~7-day storage eviction (mitigated by Add to Home Screen). **Durable workflow:** Copy/Export before re-dropping a build; Import after, to carry the record across.
- **Archived exports live in `docs/playtest-data/`** (added 2026-07-21) — the durable copy, since `localStorage` is per-device and per-URL. See that folder's README for how to add one and for the current read-out. First export (2026-07-20, 3 games / 1 completed) shows **0 hard stalls, 0 deck recycles, and 3-for-3 successful Jailbreaks** — so the entire failed-Jailbreak/Curse path and the recycle pile are still untested in real play. Worth deliberately failing a Jailbreak to exercise it.
- **Candidate fix for the per-device split: sync records to Supabase** (one insert-only table, best-effort, `localStorage` stays primary). Does **not** require the multiplayer work and would stand up the Supabase project early — written up in `docs/MULTIPLAYER_PREP.md`.
- Implementation: `Telemetry` object near the top of the main `<script>` in `app/index.html`. Hooks: `Telemetry.startGame(names, rounds)` / `Telemetry.endGame(players)` at game start/end; `Telemetry.bump(key)` / `Telemetry.mark(type, detail)` at each event site (bumps accumulate into the current game record).

## Known open items

- **No sound-effects on/off control.** Music has a toggle (Settings + in-game MENU); SFX do not. The `sfxEnabled` flag exists in the SFX manager but has no UI wired to it, so sound effects can't be muted independently. Small, self-contained job.
- **Jailbreak reveal timing is tunable** (build 13): `JAILBREAK_BUILDUP_MS` (1100ms, must stay in sync with the `brigShake`/`brigGlow` CSS durations), the shake amplitudes in `@keyframes brigShake`, and the synth riser's 60→280Hz sweep. Awaiting Nick's playtest feedback on whether the intensity/length feel right.
- **⚠ "Endless round" / soft stall (found in playtest 2026-07-21, iPad — highest-priority open question).** Nick: *"genuinely the longest and most unenjoyable round I've played so far."* One game reached **9 completed runs and 2 full deck recycles (74 of 104 cards)** while still on round 2 of 4, having started the previous evening. High activity, no progress toward the win condition. Hypothesis (inference, **not** confirmed — do not change a rule on it yet): completed runs send Kings to The Brig rather than the recycle pile, so Kings cycle Brig→run→Brig and drain out of hands; Kings are the wildcards that unstick an awkward HOLD top, and a Jailbreak only triggers when a King is *played*, so the drain is self-reinforcing. Meanwhile each completion swaps a flexible run for an empty one that accepts only A/Q, and the recycle pile means nothing ever forces the round to end. Reads as the recycle-pile ratification's unintended consequence: it converted a **hard** stall (breaks, obvious, tracked) into a **soft** stall (continues, unenjoyable, invisible). Note `hardStalls: 0` in that game is *not* reassurance — the game never reached the state we were watching for. **Nick's first-hand account (2026-07-21):** the long wall-clock spans are partly idle time (the iPad was put down), so duration is contaminated — but he confirms the round was *genuinely stalled* and *"we sort of lost interest."* The activity counts (9 runs, 2 recycles) are unaffected by idle time, so the structural finding stands. **Disengagement is the real failure mode here, and no current counter detects it.** Full analysis: `docs/playtest-data/README.md`.
- **First-player advantage — FIXED in build 15, now measuring.** The starting player rotates each round. The Tracker shows **"Rounds won by whoever started"**; it reads `—` until enough build-15 games accumulate, and around **50%** means the seat no longer matters. If it settles well above 50%, the round-race dynamic still favours the starter and needs a deeper fix than rotation. Note pre-build-15 games have no round log and are excluded.
- **Richer telemetry — Tier 1 done in builds 15–16** (per-round starter/winner/duration/scores; per-turn plays, sources, HOLD sizes, empty runs, Brig size, dead turns, stall streak, idle-removed play time). Tiers 2–4 deferred — see `docs/TELEMETRY_PLAN.md`. ~~Partly done in build 15~~ (per-round starter, winner, duration and scores). Still missing, in value order: **turn counts per round**, HOLD pile size per player per turn, and turns where the player made no run play. Those are what the "endless round" diagnosis actually needs — see the playtest README. **Caveat on build 15's round durations:** Nick confirmed the iPad game was put down for long stretches, so wall-clock time is inflated by idle periods and is only a weak signal. **Turn count is the metric that cannot be faked by a game sitting on a table** — prioritise it over duration.
- **Deal animation for the manual redraw (deferred 2026-07-21 — playtest build 14 first).** Cards drawn via the new "Draw cards" button currently just cross-fade in together (~0.25s): `render()` is wrapped in a View Transition, which tweens cards that *move* between positions, but a newly drawn card has no prior position so it gets the browser's default fade. Candidate polish: stagger each card in from the deck counter (~60ms apart) plus a riffle SFX, non-blocking so the player can tap a card the moment it lands. Nick wants to feel the current version on device first.
- **Playwright test harness (deferred 2026-07-21 — likely alongside the multiplayer move).** No way to run the game headlessly today, so edge cases can only be verified by code trace or by Nick playing. A Playwright rig would let rare states (jailbreak + empty hand + one HOLD card, the residual hard stall) be set up on demand and re-run as regression tests — most valuable right before the rules-engine extraction, when regressions get dangerous.
- **`pendingWinner` is dead state.** It is assigned in three places (`afterPlay`, `discardSelectedTo`, round setup) and **never read anywhere** — round-end is driven entirely by the `goal.length === 0` checks. Harmless today, but it will mislead whoever does the multiplayer port. Either delete it or wire it up.
- **Residual hard stall** is still reachable (build 14 did NOT fix this): active player has empty hand, empty draw deck, and empty recycle pile (all cards locked in goals/discards/incomplete runs/The Brig). Player then can't draw and can't discard to end the turn. It is detected, logged, and **counted by the Tracker**, but NOT auto-resolved. Decision deferred: Nick wants to gather Tracker data on how often it happens before deciding a fix (candidate fix: recycle discard piles as a last resort, or a forced end-of-turn).

## Bigger direction (planning — documented 2026-07-21, no code written)

- Converting to **Next.js** with **true remote multiplayer** on **Supabase**.
- **Repo confirmed and reviewed (2026-07-21):** `github.com/NickBlackhall/studio` ("Make It Terrible"). Next.js 15 + React + TS + Supabase (Postgres + Realtime) + Netlify. **Reusable ~30% (game-agnostic):** `supabaseClient.ts`, the room-code system (migration 001 + `roomCodes.ts` + `createRoom`/`getGameByRoomCode`), the subscribe→refetch-authoritative-state context (`SharedGameContext.tsx` — the key pattern to lift), auth/roles (`auth.ts` + `gameAuth.ts`, RLS migration 003), and lifecycle (dead-room detection, `cleanupEmptyRooms`, host-ended vs room-torn-down teardown). **Not reusable:** all game logic in `src/app/game/actions.ts` (~88KB, welded to MIT's judge/cards/scenarios) and all UI. Gotcha: its realtime subscription is broad (`event:'*', schema:'public'`, filtered client-side) and `useTargetedGameSubscription.ts` is an abandoned empty stub — use targeted per-table filters for Schooner from day one.
- **Quick chat / taunts (added 2026-07-21).** Nick wants in-game messaging with remote players. Decided: **canned quick-chat taunts first, free text later if missed** — better on mobile (no keyboard covering the board), fits the pirate theme, no abuse surface, and `app/assets/sfx-taunt.mp3` already ships. Cheap once the multiplayer skeleton exists (same live-sync pipe, and unlike a card play it needs no rules validation); not worth building standalone. Two open questions before free text: private DMs enable collusion with secret hands, and real privacy needs RLS rather than UI hiding. Written up in `docs/MULTIPLAYER_PREP.md`.
- **Agreed approach:** "lift the multiplayer skeleton, rewrite the game core," as a **separate Next.js app alongside** the current single-file build — not an evolution of `app/index.html`.
- **Plans written this session (read these first):**
  - `docs/MULTIPLAYER_PREP.md` — plain-English prep steps to do to the *current* game so the move is a lift, not a rewrite (separate rules from presentation; turn the King-direction modal into an explicit move; seed the shuffle; private/public split), plus a technical appendix sketching the Supabase schema and server-action list.
  - `docs/RULES_VS_LOOKS_MAP.md` — every function in `app/index.html` sorted into rules / looks / mixed, as a checklist for that refactor. Pile C (~15 functions) is the actual work.
- Confirmed by Nick: each player on their own device, sees only their own hand; only the active player can move. Hands and goal-pile contents are secret; runs/brig/scores/turn and pile *sizes* are shared. Ports are currently private but are the likely first thing to make peekable (see the brief's design-questions section).
- Architecture prep per `AGENTS.md`/brief: separate **game state / rules engine / validated actions / renderer**. Expected action types: `START_GAME`, `START_ROUND`, `PLAY_CARD_TO_RUN`, `DECLARE_KING`, `RESOLVE_JAILBREAK`, `DISCARD_CARD`, `END_TURN`, `COMPLETE_RUN`, `END_ROUND`.

### What Claude still needs from Nick to proceed on multiplayer
1. ~~Link to the existing multiplayer repo~~ — **done**, reviewed 2026-07-21 (see above).
2. Any notes/summary from the **2026-07-19 planning chat** with the other Claude instance — still outstanding.
3. A go-ahead to start `MULTIPLAYER_PREP.md` item #1 (extract the rules engine from `app/index.html`). Not started; Nick may prefer to keep playtesting first so the ruleset is fully settled before it's frozen into an engine.

## Change history

### 2026-07-20 → 2026-07-21 (Claude / Opus) — pushed to main
<!-- Entries 1–10 landed 2026-07-20; entries 11–13 landed 2026-07-21. -->

1. `Restructure repo around v26 as the canonical build` — moved the v26 build into `app/`, archived v11 to `reference/`, tidied stray root files.
2. `Remove dead opening-King anchor code; audit card-supply rules` — deleted unreachable anchor code; added the King-supply/shuffle audit to the brief; ratified the recycle pile.
3. `Failed Jailbreak: reshuffle unplaced Kings into the draw deck` — removed the permanent Locker; kept 1-per-King penalty; updated player-facing text and the brief.
4. `Add offline playtest tracker for edge-case frequencies` — Telemetry module + hooks + MENU viewer.
5. Added `build-drop-zip.sh`, `.gitignore` (zip artifact), and this `WORKLOG.md`.
6. Upgraded the tracker to per-game records with Export (Copy JSON / Copy CSV / Download CSV) and Import/restore (merge, deduped; absorbs old V1 aggregate). Storage key bumped to `saltySchoonerTrackerV2`.
7. Added the decided-game (clinch) notice: at round end, if a player has mathematically clinched, the Round Over screen offers the host "End game now" vs "Keep playing". Conservative test (`clinchedPlayer()`); records `game-clinched` events and an `endedEarly` per-game flag. Documented in the brief under Game Goal and Scoring.
8. Added a "Playtest Tracker" button on the setup/settings screen (`setupTrackerBtn`) so data can be viewed/exported/imported without starting a game. Same `showTelemetry()` viewer as the in-game MENU button.
9. Added a visible build stamp (`APP_BUILD` constant, shown in the setup screen and in-game MENU via `.buildStamp` elements) so the deployed build is easy to confirm. **Convention: the build number equals the latest entry number in this change history — bump `APP_BUILD` in `app/index.html` and add a new entry here with every shipped change so they stay in sync.**
10. `Add sound effects to the hotseat game` — rebuilt the SFX manager to mix recorded clips with live Web-Audio synthesis. **Recorded:** playing a card to a run cycles three "Ethnic Power Up" flourishes (`assets/sfx-place-{1,2,3}.mp3`, ~2.6s, non-overlapping — a new play cuts off the previous); discarding (which ends the turn) rings the "captain boat bell" (`assets/sfx-discard.mp3`); Jailbreak trigger uses "Ethnic Drums Achievement 1" (`assets/sfx-jailbreak.mp3`); the existing taunt laugh (`assets/sfx-taunt.mp3`) is unchanged. **Synthesized (no files):** select, deselect, illegal, ui, plus Jailbreak success (bright ascending arpeggio) and failure (dark descending motif). Source clips live in `/added sounds/` (not shipped). No rules changed. `sfxEnabled` flag still awaits a Settings toggle.
11. `Auto-start the title theme` — the title/menu music never played on its own: the only trigger was the Settings "Play Music" toggle, and `startBackgroundMusic()` (Set Sail) plays the *game* loop, not the title theme. Browsers also block audio until a user gesture. Fix: `finishBootSplash()` (the boot-splash "Tap to continue", the first gesture) now starts the title theme in the `'menu'` context if music isn't already on; Set Sail still swaps to the game loop and the Settings toggle still mutes/unmutes. No rules changed.
12. `Rework the Jailbreak splash into a readable modal` — the splash art briefly flashed *behind* the board cards because `beginJailbreak()`'s `render()` runs a View Transition, whose animating card snapshots paint in the browser top layer above the `z-index:100` overlay. Fix: wrap that render in `window.suppressCardTransitions` (same guard the turn-handoff uses) so the fullscreen splash covers cleanly. Also removed the 2.1s auto-dismiss (it now stays until the player taps to continue) and added a titled panel ("JAILBREAK!") with a one-line explainer of what to do (play every freed King onto the Runs before discarding, or unplayed Kings reshuffle in and add a penalty card). Art stays large behind the panel. No rules changed.
13. `Jailbreak pressure build-up + copy tweak` — added a ~1.1s build-up before the splash: after the triggering King lands, `.brigOverlay` gets `.brig-bursting`, which shakes (accelerating — `@keyframes brigShake`) while its glow intensifies (`@keyframes brigGlow`, on `filter`/drop-shadow since `.brig-open` sets `box-shadow !important`), then bursts into the modal (`JAILBREAK_BUILDUP_MS`, kept in sync with the CSS). A synth "riser" cue (`jailbreak-buildup`) rises under the shake; the drums (`jailbreak-trigger`) still hit at the burst. Reduced-motion gets a 260ms beat instead. Also updated the splash explainer copy to "Play every released King or suffer the Curse of the Crown! …" (now static markup; dropped the dynamic King count). No rules changed.

14. `Voluntary mid-turn hand refill` — **rules change, approved by Nick 2026-07-21.** Found in playtest: a player deliberately emptied their hand to finish a round at 0 points, but the automatic mid-turn refill handed them 5 cards before they played their last HOLD card, so they scored 5 and lost the round to an opponent who had not even cleared their goal. Cause: `afterPlay()` auto-drew to 5 whenever the hand emptied (Skip-Bo's rule, where hand cards do not score) while Schooner scores hand cards at 1 point each — so the stronger line was punished and a 0-point round was unreachable. Fix: the auto-draw is gone; an empty hand now shows a **"Draw cards"** button in the hand panel (`drawHandCards()`), and the offer stays open all turn, so declining is never a dead end. Ending a turn still requires discarding a hand card — **no new end-turn rule was added**, because clearing the goal pile already ends the round with no discard, and released Brig Kings are played from The Brig rather than from hand. So clearing hand + HOLD + Brig in one turn now scores 0, as it would at a physical table. The end-of-turn refill after discarding is unchanged (a turn still starts with 5). Also: "Force end" no longer silently draws 5 on its way out; the empty-hand log line is latched via `state.handEmptyNoted` (cleared by `drawTo`) because `afterPlay()` now runs repeatedly with an empty hand; the in-game How to Play text was updated. Stall detection moved from `'after-play refill'` to `'player-requested refill'` — it now fires when the player taps Draw and gets nothing, rather than automatically.

15. `Rotate the starting player; record per-round results` — **rules change, approved by Nick 2026-07-21.** `startRound()` hardcoded `state.currentPlayer = 0`, so **Player 1 started every round of every game**. A round is a race — it ends the instant someone clears their HOLD pile, and the loser keeps theirs as points — so the starter gets an extra turn. Now `state.currentPlayer = (state.round - 1) % state.players.length`, and the round-start log line names who goes first. Made on the structural argument, not the data: P1 had won 4 of 5 recorded games, which a fair coin reproduces 18.8% of the time. **Also added per-round telemetry** so the question is measurable: each game record gains a `roundLog` array (`round`, `starter`, `winner`, `started`/`ended`, per-player `roundScore`/`total`) via `Telemetry.startRound()` / `Telemetry.endRound()`. Game-level scores gave 1 data point per game; those 5 games contained 15 rounds. The Tracker gains a **"Rounds won by whoever started"** row — the direct test, where ~50% means the seat is fair — plus a per-game round strip (`R1 ▶1 ✓2 14m`, gold when the starter won) showing round durations, which the "endless round" investigation also needs. Round duration is now recorded, so a dragging round is visible in data rather than only in memory. Verified by extracting `Telemetry` and running it under Node with a `localStorage` stub: rotation alternates correctly, rounds close with scores, a closed round cannot be overwritten by a repeat `endRound`, and pre-build-15 records without a `roundLog` are tolerated. Pre-build-15 games are excluded from the new stat.

16. `Per-turn telemetry (Tier 1)` — no rules changed. The "endless round" could not be diagnosed from counters: they record volume, not shape. Each game record now carries a **`turnLog`**, one compact record per turn: round, turn-in-round, seat, start/end, cards played to runs and their source (hand/goal/port/brig), manual draws, **every seat's HOLD size**, empty-run count, Kings in the Brig, and how the turn ended. Hooks: `Telemetry.startTurn()` in `startRound()`/`nextTurn()`, `noteRunPlay()` in `playSelectedToRun()`/`commitKing()`, `noteDraw()` in `drawHandCards()`, `endTurn()` in `nextTurn()`/`endRound()`/force-end, with `turnSnapshot()` supplying the board facts. Tracker gains **turns per round**, **DEAD turns** (no run play — red above 40%), **longest stall streak** (consecutive turns where no HOLD pile shrank — red at 12+), and **play time with idle removed** (each turn capped at 3 min, so a game left on a table cannot inflate it — this addresses the wall-clock contamination Nick reported). Also adds **`Copy turns (CSV)` / `Download turns CSV`**: the JSON turn log is ~195 bytes/turn (~23KB a game, awkward to paste), the CSV is ~64 (~8KB) and opens in a spreadsheet. `MAX_TURNS` (600) caps the log; overflow sets `turnsTruncated`. Verified under Node with a `localStorage` stub and a faked clock, simulating a healthy round and a stalled one: turn numbering, per-round grouping, a flat-vs-stepping HOLD curve, stall streak of 20, a 40-minute pause excluded from play time, closed turns immutable, and pre-build-16 records tolerated. Tiers 2–4 (card census, jailbreak detail, and a round-end thumbs up/down for the disengagement signal counters cannot reach) are deliberately deferred — see `docs/TELEMETRY_PLAN.md`.

Note on process: earlier, a King-opener issue in the v11 file was fixed but then superseded when v26 became canonical — a reminder to always confirm which build is authoritative before editing.

23. `PIN-gated /admin page` — room list plus a full reset, for the person running
    the game. Nothing cleaned up rooms before this, so they accumulated silently
    (three stale ones at the time of writing) and there was no way to see what
    existed. `/admin` lists every room with its seated players, and offers a
    reset that deletes all rooms, players and pulse rows.
    - **The PIN is short and memorable by Nick's explicit choice**, threat model
      stated as "a mischievous nephew, not a malicious outsider". That is only
      sound because guessing is rate-limited: `salty_schooner.admin_guard` tracks
      failures and locks out for 15 minutes after 5 wrong tries, verified to
      refuse even the correct PIN while locked. **If that lockout is ever
      removed, the PIN must become a long random secret.** Stored as the
      `ADMIN_PIN` Netlify env var, compared server-side with
      `crypto.timingSafeEqual`, never shipped to the browser.
    - Fails closed: a missing `ADMIN_PIN` disables the endpoint rather than
      accepting an empty PIN.
    - Two independent gates on the destructive path — the PIN proves who you
      are, typing `NUKE` proves you meant it.
    - `admin_guard` has RLS on with no policies and no grant, like `rooms` and
      `players`. Only the service role touches it.
    - **The delete path was tested for real, not just reasoned about:** Nick's
      three live rooms were copied to backup tables inside Postgres, the nuke was
      run through the actual HTTP endpoint, all three tables verified empty
      (confirming the `room_pulse` cascade), then everything was restored and
      re-verified. Deleting players before rooms matters — that foreign key is
      not `ON DELETE CASCADE`.
    - **Per-room delete added the same session** (`action: 'delete-room'`), and it
      is the one actually reached for: the normal situation is one room you care
      about and one you do not. Proven by this very session — the full nuke could
      not be used to tidy up test rooms while Nick's games were live, which is
      exactly the gap. Verified to remove only the named room, leave the other
      three untouched, and leave no orphaned pulse or player rows. Bad code,
      missing code and wrong PIN are all refused. The row button is two-step
      (tap arms it, tap again deletes, self-disarms after 5s) rather than
      confirm-word — worth guarding against a stray tap, not worth typing for.

24. `Clearing HOLD no longer ends the round instantly` — **rules change,
    decided by the group at a physical table 2026-08-02, approved by Nick.
    Multiplayer only.** They played on cards, not the build, and hit a line the
    old rule forbade: a player emptied HOLD, still had a legal hand card, played
    it, then discarded their last card to finish the round on **zero**.
    - **Was:** `runAfterPlay()` called `endRound()` the moment `goal.length === 0`,
      mid-turn, cancelling any legal plays still available.
    - **Now:** three outcomes, and they are genuinely different —
      (1) released Jailbreak Kings outstanding → defer, that debt comes first
      (unchanged); (2) HOLD empty **and** hand empty → end **immediately**, no
      discard; (3) HOLD empty, hand still holding → defer, and the existing
      `goal.length === 0` check in `applyDiscardToPort` ends it there.
    - **Case 2 is the reason this is not simply "end at the discard"** — Nick
      raised it unprompted. §7 requires a hand card to end a turn, so deferring
      unconditionally would force a player with nothing left to **draw a fresh
      hand purely to end a round already over**.
    - **Removed an early `return` after Jailbreak success.** Completing a
      Jailbreak can itself be the play that leaves HOLD and hand both empty, and
      the early return skipped the round-end check — stranding that player with
      nothing to discard. Now falls through. Covered by a test.
    - **No new state.** `pendingWinner` was confirmed still dead (assigned in
      three places, read nowhere) so it was not leaned on; deferral works purely
      by *not* calling `endRound()`.
    - **No client change needed** — `/play` and `/tv` only branch on
      `status === 'ROUND_RESULTS'`, which still fires, just later.
    - **Test written BEFORE the change and run against the old engine first**, to
      prove it caught the old behaviour: case 3 failed exactly as the group
      described, then the discard threw "No round is in progress". 17 assertions
      in `scripts/test-round-end.js`, all passing after; `test-draw-rule.js`
      still passes; engine copies re-synced; a real room dealt through the live
      functions.
    - `docs/RULES.md` §11 rewritten, §7 gained the empty-hand exception, §13 and
      the §14 conformance table updated. **Hot-seat is now three rule changes
      behind, deliberately.**

## For ChatGPT / Codex working in this space

- Authority order (from `AGENTS.md`): `MASTER_PROJECT_BRIEF.md` → newer decisions approved by Nick → newest stable prototype → existing implementation.
- Canonical build is `app/index.html` on `main`. Don't create a parallel copy elsewhere.
- Rules are protected: don't change game rules/scoring/King/Jailbreak/etc. without Nick's explicit approval, and document any change in the brief.
- After editing `app/`, run `./build-drop-zip.sh` so the drop zip stays current.
- Append your changes to the Change history above so the next collaborator can follow.

### 2026-07-27 → 2026-07-30 (Claude) — branch `multiplayer-prototype`

15. `Jackbox-style multiplayer prototype` — the roadmap in
    `docs/SALTY_SCHOONER_MULTIPLAYER_ROADMAP.md` (recovered from an unpushed
    Codespace) is now partly built. Deliberately **skipped** the roadmap's Phase 1
    clean rules-engine extraction: Nick expects rules to change after playtesting,
    so a pristine architecture would have been redone. Expect rough edges.
    - **Backend:** five Netlify Functions — `create-room`, `join-room`,
      `start-game`, `submit-action`, `get-state` — plus `reset-game` and an
      unauthenticated `get-public-state`. All rules run server-side; clients only
      *propose* actions. Optimistic concurrency via `state_version`.
    - **Screens:** `/host` (create room, Start, Next Round, Reset), `/join`,
      `/play` (private hand), `/tv` (token-free public board by room code).
    - **`/tv` takes no token deliberately** — `getHostView` is public-only
      (face-up HOLD tops, counts, runs, Brig, scores, log, deck *count*).
      Verified on production that it leaks no hands, Ports, goal arrays, deck
      contents or tokens. **Never point that endpoint at `getPlayerView`.**
    - **Rejoin is self-service:** entering the same room code and the *exact same
      name* at `/join` returns that seat's existing credentials. Tradeoff is
      deliberate and documented in `join-room.js` — code + display name claims a
      seat, which is fine for one room, wrong for public matchmaking.
    - **Visual pass:** `app/shared/theme.css` gives all four screens the hot-seat
      look (board art, Cinzel, gold/wood palette, 5:7 card faces). Layout is
      deliberately *not* copied — hot-seat is one landscape screen; multiplayer
      splits public board from private hand.
    - **Sound:** `app/shared/sfx.js` is the v28 manager lifted from
      `app/index.html`. `/tv` carries the shared theatre (Brig burst → Jailbreak
      art + drums → Curse / Brig-secured stings, auto-dismissing since nobody taps
      a television) plus a mute button. `/play` gets only local cues for your own
      taps. Because `get-public-state` is a snapshot with no event stream, `/tv`
      derives events by **diffing the log**; first poll, window overflow, re-deal
      and room switch all re-baseline **silently** on purpose — that is not a bug.

16. `Hand refill is always the player's choice` — **rules change, approved by Nick
    2026-07-29. Multiplayer only; `app/index.html` keeps the old behaviour.**
    Found in real play: every player who did not win a round scored their HOLD
    *plus exactly 5*, because the turn ended with an unconditional refill. A
    penalty nobody chose, and a scoring term identical for everyone but the
    winner, so it distinguished nothing. Nick also noted it let a player claim
    deck cards that then sat unusable through everyone else's turns. Replaced with
    a **start-of-turn quota** (`5 − hand size when the turn began`, computed once,
    never recalculated upward — start with 4, play one, still draw only 1, landing
    on 4 not 5) plus the existing **empty-hand draw** (up to 5, repeatable), which
    supersedes rather than stacks. Opening deal needs no special case: everyone
    holds 5, so the quota is 0. Extends build 14's "refilling mid-turn is the
    player's call" to close the turn-end loophole. Full text: `docs/RULES.md` §8.

17. `docs/RULES.md` — the ruleset finally written down, with a change log and a
    build-conformance table. **Not ratified.** Three `⚑` items need Nick:
    Run 1's non-Ace/Queen opener, Curse penalties being able to *un-win* a round,
    and a second Jailbreak being reachable in one turn. Also found: **the clinch
    check is provably unsound** — it assumes a max round score of `holdCards + 5`,
    but Curse penalties grow HOLD past its starting size (demonstrated: 19 against
    an assumed ceiling of 15), so the game can offer to end early claiming someone
    is "mathematically uncatchable" when they are not. Unfixed, needs Nick's call.

18. `Controller fixes` — Port fan added to `/play` (tap the count badge to spread a
    pile open; hot-seat has this, the phone did not, and Nick confirmed skilled
    play depends on deliberately layering Ports). Then four bugs found reviewing
    it, two of them pre-existing: a fixed overlay surviving a host reset (the same
    omission made twice — **any new fixed overlay must be torn down in
    `render()`'s LOBBY branch**); the fan burying the King direction question; and
    worst, **`sendPlay()` read `selected` at the moment a choice was tapped rather
    than when the King was committed**, so committing a King then touching a hand
    card played the hand card instead. Also, an in-flight poll could overwrite a
    fresher post-action view, making a played card visibly jump back to hand —
    `applyView()` now drops stale views, while always letting version-less LOBBY
    views through so host resets still reach phones.

**Note on the build-stamp convention:** entries 15–18 change only the multiplayer
app, never `app/index.html`, so `APP_BUILD` stays at `v26 · build 16`.

19. `Adaptive polling` + `usage incident writeup` — **the site got paused for
    exceeding Netlify's Free-tier function quota.** Full account:
    - Every screen polled on a flat `setInterval` with no regard for tab
      visibility (`/play` 800ms, `/host` 900ms, `/tv` 1000ms). Two Browser-pane
      test tabs — one draft `/host`, one production `/play` — were left open
      against deployed URLs for roughly two days, polling the whole time.
    - Netlify's dashboard (Function settings → Usage) showed the real number:
      **191,384 / 125,000 requests for Jul 1 – Aug 1, 66,384 over.** The
      project auto-paused; every route including functions now 503s.
    - **A wrong turn worth recording so it isn't repeated:** mid-diagnosis,
      Claude checked a DIFFERENT site's usage panel (Make It Terrible, which
      read 3,458/125,000) and concluded from that mismatch that the whole
      original diagnosis had been wrong by ~100x. It hadn't — **the usage
      counter is per-site**, not account-wide, and the actually-relevant
      number (Salty Schooner's own panel) confirmed the original theory. Two
      lesson: verify against the dashboard before revising a theory, and when
      pulling a usage/limits number, make sure it's scoped to the right site.
    - **Fix:** `app/shared/poller.js`, used by all three screens. (1) Pause
      entirely while `document.hidden` — a backgrounded tab now makes ZERO
      requests, which alone prevents this exact incident. (2) Stop completely
      after 10min (20 on `/tv`) of no state change AND no user interaction;
      offer a "Resume" tap. (3) Back off the interval when nothing is
      changing, snap back instantly on any change or interaction. (4) Per-state
      base rates — a player's OWN turn polls fast (1200ms), a waiting player
      slow (3500ms), lobby slower still. `/tv`'s backoff ceiling is
      deliberately lower (4s) than the others so the Jailbreak burst doesn't
      arrive late.
    - Measured before/after: hidden tab over 10s, ~12 calls → **0**. Active
      player's own tab over 16s, 20 calls → 7. Abandoned poller gave up after
      5 calls where flat polling would have made 23.
    - **This is mitigation, not the fix.** Even with adaptive polling, a real
      2-hour 4-player session is an estimated ~18,000 invocations — roughly
      **7 sessions/month before hitting the same 125,000 cap again.** The
      actual fix is moving reads to **Supabase Realtime** (already paid for),
      which would drop a session to roughly the number of moves played —
      a few hundred. Not started. This is now the top priority, ahead of
      styling polish or the host-as-a-seat rework, because it is a recurring
      cost problem, not a one-off. See `[[salty-schooner-multiplayer]]` in
      Claude's memory for the full technical framing (targeted subscriptions,
      not Make It Terrible's broad `event:'*'` pattern, which has its own
      known bug that Nick is fixing separately in that repo).
    - **Deploy status:** the fix is committed and pushed (`272bf99`,
      `main`/`multiplayer-prototype`) but was NEVER promoted to production —
      the site got paused before that could happen. Production is still
      running the old flat-polling code as of this writing. See the READ FIRST
      section at the top of this file for the exact sequencing needed once the
      site comes back. **→ Resolved 2026-08-01, entry 20.**

20. `Promote the polling fix to production` — no code written; this entry is a
    verification record. The site came back on its own when the billing period
    rolled (Aug 1), and the first thing checked was whether the incident's cause
    was actually gone. **It was not.** Production was still serving
    `setInterval(poll, 800)` with no visibility guard, and `/shared/poller.js`
    404'd — the fix had sat on the branch for two days while the live URL kept
    the exact code that burned the quota. Three independent signals agreed
    production was stale (`poller.js`, `theme.css` and `sfx.js` all 404 while
    `engine.js` returned 200, ruling out a path mistake rather than assuming it).
    Also checked and found clean: no leftover polling browser tabs, and no
    scheduled/cron functions quietly burning invocations.
    **The deploy decision was deliberately handed to Nick rather than executed**,
    because `--prod --build` bundles the unreviewed styling pass and the entry-16
    rule change with the polling fix, and the whole reason those sat on draft
    URLs was to keep an unreviewed visual pass away from a live session. Nick
    approved promoting the branch whole. Post-deploy verification, all by curl
    (no browser tab opened against production at any point): shared assets 200,
    all three screens reference `poller.js`, flat `setInterval` gone from
    production `/play`, production `poller.js` byte-identical to local, and
    `/api/get-public-state` returning a JSON function-level error rather than an
    HTML routing 404. **Restating the thing most likely to be forgotten: this
    lowers the burn rate, it does not fix it.** ~18,000 invocations per 2-hour
    session ≈ 7 sessions/month against the same cap. Supabase Realtime is still
    the actual fix and is still not started. **→ Built in entry 21.**

21. `Supabase Realtime doorbell replaces polling` — **the actual fix for the
    invocation problem.** Committed `ef864d0`; **verified on localhost but NOT
    yet deployed** (the production promote needs Nick to run it).

    **The trap, first, because it is the whole reason this is shaped the way it
    is.** The obvious implementation is to subscribe clients to the `rooms`
    table. That would have been a serious leak: Realtime hands every subscriber
    the entire changed row, and `rooms.current_game_state` is one jsonb blob
    holding every hand, every goal pile, the Ports and the deck order — plus
    `host_resume_token`. Any player could have read every other player's cards
    from devtools, silently undoing the `getHostView`/`getPlayerView` split that
    `get-public-state.js` is so careful about. **Never subscribe a client to
    `rooms` or `players`.**

    **So Realtime is a doorbell, not a delivery truck.** New table
    `salty_schooner.room_pulse` carries only `room_id`, `room_code`,
    `state_version`, `status`, `updated_at` — nothing secret. Clients subscribe
    there; on a bump they re-fetch through `get-state`, which still checks a
    token and filters per seat. The server remains the only thing that can see a
    hand. **Invariant: never add a column to `room_pulse` that an unauthenticated
    stranger should not read.** `room_code` is on it deliberately, because `/tv`
    is token-free and addressed by code — that avoided widening the public view
    to expose `room_id`.

    **Security verified rather than assumed.** The publishable key now ships to
    browsers, so the boundary was tested three ways: REST calls with that key
    against `rooms` and `players` both return `permission denied`, the same two
    checks run from inside a live subscriber, and the delivered payload was
    inspected to confirm it contains only the five non-secret columns. Two
    independent layers hold it: no table grant to `anon`, AND RLS enabled with
    zero policies. `alter default privileges` was also set so a future table in
    this schema is denied by default rather than opened by accident.

    **Measured on localhost, not estimated.** `/tv` idle for 25s: **12 fetches →
    1**. One state change produces **exactly one** fetch. End-to-end latency
    server-write → browser-receive was **~122ms** (an earlier 2275ms reading was
    a measurement artifact — `now()` returns *transaction* start time, so a
    batched `pg_sleep` test backdated its own timestamps; `clock_timestamp()`
    gives the true figure). All four server paths ring the bell: create, join,
    start, and every action.

    **Failure degrades, it does not freeze.** Killing the socket returned the
    poller to ~3s — i.e. a phone that loses Realtime behaves exactly as it did
    before this change. `isLive()` is the single switch each screen uses to pick
    between the 45s safety net and the old fast rates, and `poller.wake()` was
    added so a doorbell arriving *after* the idle stop restarts the screen rather
    than stranding it behind a "Resume" button. The vendored bundle simply being
    absent is also a supported state, not a crash.

    **Player-visible effect, all improvement:** a waiting player used to see
    moves up to 3.5s late, backing off to 10s; that is now sub-second. No rules,
    screens or controls changed.

    **Also fixed a latent poller bug** this change would have tripped: when
    `intervalFor()` exceeds `maxInterval`, `Math.min` made "backing off" speed
    polling *up* — the 45s safety-net rate would have been clamped back to 10s on
    every quiet game, quietly eating most of the saving.

    `app/shared/vendor/supabase.js` is the official UMD build (v2.110.9) copied
    from `node_modules`, served as a static asset — deliberately not a CDN, so
    the game has no third-party runtime dependency.

22. `A cleared hand pays out only once the allowance is spent` — **rules change,
    approved by Nick 2026-08-02. Multiplayer only.** Raised by Nick from real
    play: he expected clearing a hand of 3 to still owe him only the 2 he started
    the turn entitled to, not a fresh 5.
    - **Was:** `drawEligibility` returned `HAND_LIMIT` for *any* empty hand,
      whatever was left of the start-of-turn quota. **Now:** the fresh 5 requires
      `hand.length === 0 && quota === 0`.
    - **Why it was worth changing, beyond matching intent:** the old rule made
      "empty your hand before you draw" strictly dominant. Holding 3 with a quota
      of 2, playing all three then drawing paid **5 cards**, while drawing first
      then playing the same three left you holding **2** — identical play, double
      the reward for knowing the trick. That is a tax on not knowing it, not a
      decision.
    - **Accepted tradeoff:** harsher on a bad draw. Clear your hand, take your 2,
      and if both are dead the turn ends there where the old rule gave you 5 to
      hunt through. Nick was told this before approving.
    - **Does not create a stall:** §7 requires ending a turn by discarding from
      hand, and every empty-hand case still yields *something* to draw (the quota
      if outstanding, otherwise a fresh 5), so a player can always reach a
      discard. The pre-existing deck+recycle exhaustion stall is unaffected.
    - `applyDrawHand` now calls `drawEligibility` instead of recomputing the rule,
      so the number on the phone and the number dealt cannot drift apart.
    - The draw button lost its count and just reads **"Draw cards"** (Nick's
      call): the amount is a function of quota-and-clearedness, and a label
      stating a number is one more thing that can lie.
    - Verified by `scripts/test-draw-rule.js` — 22 assertions covering Nick's
      exact scenario step by step, clearing a full hand, the old behaviour being
      gone, the promised-vs-dealt count matching, and no double-dip. All pass.
    - `docs/RULES.md` §8 rewritten, §13 change log and §14 conformance table
      updated. **The hot-seat build is now two rule changes behind, deliberately.**

23. `Remote tilted-tabletop readability and interaction polish` — **visual/UI
    change only; no game, scoring, draw, King, Brig or Jailbreak rule changed.**
    - The remote Runs and Brig now read as one continuous foreshortened ship's
      table instead of five cards floating in separate depth bands. A painted
      wood plane fills the otherwise empty tall-phone space, while the far and
      near Run rows keep content-sized tiles and the bottom controls remain in
      thumb reach.
    - The Brig is an iron gutter between the rows rather than the square Brig
      frame stretched into a strip. During a Jailbreak it stays in that gutter;
      the released Kings render as one large, counted stack (`×24` at the real
      maximum), backed by the first real released-King id. Playing it therefore
      still uses the existing authoritative handler, and the count decrements
      after each play. This also keeps the other legal sources — hand, HOLD and
      Ports — visible and tappable throughout the Jailbreak.
    - The remote hand remains a straight five-card row. At the 320px minimum,
      each hand card and HOLD card is 44px wide and Draw Cards is a 44px-high
      full-width banner. The opponent rail now uses compact rank+suit status
      plaques rather than illegible miniature card components. Suit glyphs were
      restored everywhere as redundant recognition cues; rules continue to
      ignore suit.
    - Browser-verified with the real `render()` path at 320×568, 390×844 and
      430×932, including six players, a 24-King active Jailbreak, selection of
      the grouped stack and the King direction modal. No horizontal/vertical
      overflow or console errors. Couch mode was also checked at 844×390: the
      Brig remains in `.rightCol` and the layout does not scroll.
    - Regression checks: `test-engine-sync.js`, `test-round-end.js`,
      `test-draw-rule.js` and `test-flap-cost.js` all pass. `shoot-tilt.js`
      comments now describe the in-table grouped-stack design rather than the
      superseded fixed-overlay treatment.

24. `Match the remote board to the approved 3D prototype proportions` —
    **visual/UI follow-up only; rules and server state remain untouched.** Nick
    reviewed entry 23 on a physical phone and identified two real mismatches:
    the literal wood surface was not working, and `align-content:space-between`
    was inserting large gaps between Run 1/2, the Brig and Run 3/4.
    - The grid now copies the prototype's structure: two equal Run rows around
      a Brig row roughly 44% as tall, with fixed 8px seams. No spare height is
      distributed between gameplay bands.
    - The prototype's camera values are restored (`perspective:900px`, centered
      34° tabletop pivot). Run cards are capped at 48px, or 42px at 360px and
      below, and the extra counter-rotation was removed. The faces are CSS and
      live text rather than raster card images; the softness Nick saw came from
      perspective resampling oversized `vw` cards, not an asset-resolution
      ceiling.
    - The wood plane is replaced by a dark teal graphic tabletop. The Brig keeps
      its approved shallow recessed position and adds quiet cell bars, corner
      rivets and a deeper inset shadow. An active eight-King Jailbreak stays
      inside the same row as one 44px-minimum counted stack.
    - Draw Cards remains conditional, exactly as before. Browser verification
      explicitly covered both states: when unavailable its bounding box is
      0×0 and the hand closes the vacated grid row; when available it remains a
      44px-high full-width target.
    - Browser-verified at 320×568, 390×844 and 430×932 with no document overflow
      or console warnings. Also verified a realistic eight-King Jailbreak,
      stack selection → Run tap → King direction modal, and couch mode at
      844×390 with the Brig and Draw button still in their original parents.

25. `Stable one-screen remote states and Jailbreak presentation` — **remote UI
    change only; no game rule, engine, server-view or `/tv` behavior changed.**
    - The portrait controller is now a fixed `100dvh` composition with hidden
      overflow. Its top bar, opponent rail and private dock retain fixed space;
      the Runs/Brig playfield is the only flexible region. Browser checks at the
      supported 320×568 floor, 390×844 and 430×932 showed document width and
      height equal to the viewport in normal, no-draw, own-Jailbreak and
      opponent-Jailbreak states.
    - Draw Cards remains conditional, but its 44px row is permanently reserved.
      When drawing is unavailable the control becomes invisible and inert rather
      than `display:none`, so the hand, HOLD and Ports never jump and the page
      never gains a transient scrollbar.
    - A remote Jailbreak now has a state shelf inside the existing playfield
      budget. On your turn it shows up to four released King faces plus the real
      remaining count as one accessible source; selecting it still supplies the
      first authoritative released-King id to the existing play handler. On an
      opponent's turn it becomes a noninteractive status line. In both states
      the recessed Brig strip becomes a responsive live-text `JAILBREAK` banner.
      No banner bitmap is required and no hardcoded card state was introduced.
    - The compact active state has its own short-phone proportions: a 60px event
      shelf, tighter tabletop seams and smaller board-only card faces. Hand card
      targets remain 44px wide, the active King group remains larger than 44px,
      and all four Runs remain broad panel-sized targets.
    - Browser interaction verification covered selecting the event King group,
      tapping a Run and opening the existing Captain's Orders direction modal.
      The opponent state exposes no `data-jb` target. Couch mode at 844×390 still
      reparents Brig to `.rightCol`, Draw to `.handInner`, hides the event shelf
      and has no document overflow. Browser logs contained no warnings/errors.
    - Regression checks passed: `test-engine-sync.js`, `test-round-end.js`,
      `test-draw-rule.js` and `test-flap-cost.js`. The Playwright-dependent
      `test-tap-guards.js` could not run in this checkout because Playwright is
      not installed; its relevant select-King → tap-Run path was exercised in
      the in-app browser instead.

26. `Remote geometry calibration from the 390×844 phone reference` — **visual
    layout change only; rules, server state, `/tv` and couch mode are unchanged.**
    - Normal-state table and private-dock positions now produce a measured
      46.4px visual gap between the lower Runs and Draw Cards at 390×844 (49.4px
      at 430×932). The movement tapers to zero at the 320×568 height floor, so
      the compact controller remains one screen instead of forcing overlap or
      scroll. Draw's permanently reserved row and conditional visibility are
      unchanged.
    - The hand background loses 30px from each side at the reference width and
      remains untrimmed at 320px. Its five cards retain 44×61.6px targets at
      320/390; HOLD moves into the freed left space and retains its own 44px
      target. Draw, the hand/HOLD row and Ports now meet with zero row gap.
    - Ports remain 85.8px tall at 390px (responsive 78–94px), derived from their
      52.6×73.7px card rather than an arbitrary leftover. Full card faces,
      badges and counts fit inside the panel.
    - The teal tabletop slab and lower lip are removed. The real panels,
      perspective projection and shadows now provide the depth; this preserves
      the liked far-Runs → Brig → near-Runs staircase without a competing teal
      silhouette. The table is inset and optically recentered so transformed
      lower corners paint inside the screen instead of being clipped.
    - Browser-verified normal, own-Jailbreak and opponent-Jailbreak states at
      320×568, 390×844 and 430×932. All document dimensions equal the viewport,
      the smallest hand/HOLD targets remain 44px, and browser logs contain no
      warnings or errors.

27. `Private-dock breathing room and true Port-card fit` — **remote CSS follow-up
    only; no interaction, rule, server, `/tv` or couch behavior changed.**
    - Draw→hand and hand→Ports now carry 8px reference gaps instead of touching.
      On the 320×568 floor those gaps taper to 2px, preserving the one-screen
      requirement and the 44px hand/HOLD targets.
    - The Ports row is now width-derived at 82–108px (100px at 390×844). At the
      reference size, each 52.6×73.7px Port card has 8.7px clearance above and
      17.7px below, leaving real room for the count, padding and panel borders.
      At 320×568 the row remains 82px and retains 7px/14.5px clearances.
    - The taller, spaced private dock consumes previously unused lower-screen
      space rather than changing the calibrated table relationship: the normal
      390×844 table-to-Draw gap remains 46.2px.
    - Browser-verified normal and own-Jailbreak layouts at 320×568, 390×844 and
      430×932 with viewport-equal document dimensions and no console warnings
      or errors.

28. `Remote rail, table and control sizing calibration` — **visual CSS only;
    gameplay, interaction dispatch, server views, `/tv` and couch mode unchanged.**
    - At the 390×844 reference, the opponent rail is exactly 15px taller and the
      table panels land exactly 20px lower on screen. The rail growth tapers to
      6px at 320×568, where a full 15px would consume needed playfield height.
    - Draw Cards is visually 29px tall (15px shorter) and 75% of the controller
      width. Its actual button remains a 44px-high target; the visible banner is
      painted inside that transparent hit region, preserving frequent-control
      usability without changing the requested silhouette.
    - Port card faces are 10% smaller (`13.5vw` → `12.15vw`). At 390×844 they
      measure 47.4×66.3px with 12.3px above and 21.4px below inside the 100px
      panel. The whole Port tile remains the much larger play target.
    - The taller rail initially caused the own-Jailbreak table to overlap Draw's
      transparent hit area by 2.5px. The event shelf cap was reduced by 15px;
      active Jailbreak now retains 12.5px between real targets and 20px between
      the lower Runs and Draw's visible face.
    - Browser-verified normal, own-Jailbreak and opponent-Jailbreak states at
      320×568, 390×844 and 430×932. All remain exactly one viewport, hand/HOLD
      targets remain at least 44px, and browser logs contain no errors/warnings.

29. `Photoshop-aligned private dock proportions` — **remote presentation only;
    game rules, server state, interaction dispatch, `/tv` and couch mode are
    unchanged.**
    - The hand panel is widened to roughly 74% of the 390px reference screen and
      right-aligned, while HOLD remains a separate card-sized control at left.
      At the 320px width floor the hand expands to the full available column so
      all five hand cards remain 44px-wide touch targets.
    - Draw Cards keeps its permanent 44px hit row and conditional visibility,
      but its visible 75%-width banner now aligns over the hand instead of the
      combined HOLD-plus-hand footprint.
    - The Ports panel is centered at 85% width, matching the narrower dock in
      the supplied mockup while leaving every Port tile substantially wider than
      the 44px touch-target floor.
    - Occupied Ports now show their pile size only in the gold badge. Empty
      Ports retain the small `0`, since no badge exists in that state.
    - Browser-verified normal layouts at 320×568, 390×844 and 430×932. Document
      dimensions remain exactly equal to the viewport; the smallest hand cards
      are 44px wide and the smallest Port tiles are 58px wide.

30. `Private-control vertical spacing and sizing pass` — **remote CSS only;
    rules, interaction dispatch, server views, `/tv` and couch mode are
    unchanged.**
    - Draw Cards moves upward exactly 20px without changing its reserved grid
      row, the hand, HOLD, Ports or the board. At 390×844 its 44px hitbox retains
      8.3px of separation from the transformed lower Runs; the 29px visible face
      has 15.8px of visual separation.
    - The hand background grows upward from 64px to 84px while its bottom edge
      and the Ports remain fixed. All five hand cards scale from 44×61.6px to
      48.75×68.25px at the 390px reference and center with equal side margins.
      At the 320px width floor they retain their 44px minimum and all five still
      fit on one line.
    - HOLD grows upward from 64px to 94px and expands 20px in total width—10px
      on each side—without changing the adjacent hand column. At 390px it
      measures 70.7×94px and keeps its card centered.
    - Verified with true mobile device metrics (`mobile:true`, touch emulation,
      390×844 and 320×568). Both document dimensions remain exactly equal to the
      viewport, and the protected header, opponent rail, Runs, Brig and Ports
      positions remain unchanged.
