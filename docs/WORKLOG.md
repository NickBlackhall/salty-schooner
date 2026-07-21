# Salty Schooner — Work Log & Handoff

Purpose: a running status doc so any collaborator — Claude, ChatGPT/Codex, or Nick —
can pick up where the last session left off. Read this and `MASTER_PROJECT_BRIEF.md`
(the authority) before starting work.

Last updated: 2026-07-21 (Claude / Opus) — build 15, rotating start player + per-round telemetry.

---

## Current state

- **Canonical build:** `app/index.html` (v26 "Tappable Runs", internal version `v26-configurable-match`) plus `app/assets/`. This is the single source of truth, on `main`.
- **Repo:** github.com/NickBlackhall/salty-schooner, branch `main` (pushed).
- **Older prototype:** archived at `reference/salty_schooner_v11_ipad_fit.html` (do not treat as authoritative).
- **Deploy:** Nick deploys manually to **Netlify Drop** (a throwaway site, separate from his usual Netlify site) from a zip. The "usual" live Netlify site may be an OLDER build until Nick re-drops the current one.

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
- **⚠ "Endless round" / soft stall (found in playtest 2026-07-21, iPad — highest-priority open question).** Nick: *"genuinely the longest and most unenjoyable round I've played so far."* One game reached **9 completed runs and 2 full deck recycles (74 of 104 cards)** while still on round 2 of 4, having started the previous evening. High activity, no progress toward the win condition. Hypothesis (inference, **not** confirmed — do not change a rule on it yet): completed runs send Kings to The Brig rather than the recycle pile, so Kings cycle Brig→run→Brig and drain out of hands; Kings are the wildcards that unstick an awkward HOLD top, and a Jailbreak only triggers when a King is *played*, so the drain is self-reinforcing. Meanwhile each completion swaps a flexible run for an empty one that accepts only A/Q, and the recycle pile means nothing ever forces the round to end. Reads as the recycle-pile ratification's unintended consequence: it converted a **hard** stall (breaks, obvious, tracked) into a **soft** stall (continues, unenjoyable, invisible). Note `hardStalls: 0` in that game is *not* reassurance — the game never reached the state we were watching for. Full analysis and the telemetry needed to confirm it: `docs/playtest-data/README.md`.
- **First-player advantage — FIXED in build 15, now measuring.** The starting player rotates each round. The Tracker shows **"Rounds won by whoever started"**; it reads `—` until enough build-15 games accumulate, and around **50%** means the seat no longer matters. If it settles well above 50%, the round-race dynamic still favours the starter and needs a deeper fix than rotation. Note pre-build-15 games have no round log and are excluded.
- **Richer telemetry — partly done in build 15** (per-round starter, winner, duration and scores). Still missing, in value order: **turn counts per round**, HOLD pile size per player per turn, and turns where the player made no run play. Those are what the "endless round" diagnosis actually needs — see the playtest README.
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

Note on process: earlier, a King-opener issue in the v11 file was fixed but then superseded when v26 became canonical — a reminder to always confirm which build is authoritative before editing.

## For ChatGPT / Codex working in this space

- Authority order (from `AGENTS.md`): `MASTER_PROJECT_BRIEF.md` → newer decisions approved by Nick → newest stable prototype → existing implementation.
- Canonical build is `app/index.html` on `main`. Don't create a parallel copy elsewhere.
- Rules are protected: don't change game rules/scoring/King/Jailbreak/etc. without Nick's explicit approval, and document any change in the brief.
- After editing `app/`, run `./build-drop-zip.sh` so the drop zip stays current.
- Append your changes to the Change history above so the next collaborator can follow.
