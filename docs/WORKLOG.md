# Salty Schooner — Work Log & Handoff

Purpose: a running status doc so any collaborator — Claude, ChatGPT/Codex, or Nick —
can pick up where the last session left off. Read this and `MASTER_PROJECT_BRIEF.md`
(the authority) before starting work.

Last updated: 2026-08-01 (Claude) — site is BACK UP; polling fix live, Realtime
doorbell built and committed but NOT deployed. See entries 20-21.

---

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

**The cost problem is now addressed in code but NOT YET DEPLOYED.** Entry 21
replaces polling with a Supabase Realtime doorbell (committed `ef864d0`,
verified on localhost). Until it is promoted, production is still on adaptive
polling at ~18,000 invocations per 2-hour session — about 7 sessions/month.
**Promote it:**
```
cd ~/repos/salty-schooner && netlify deploy --prod --build
```

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
