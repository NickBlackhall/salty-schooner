# Salty Schooner — Work Log & Handoff

Purpose: a running status doc so any collaborator — Claude, ChatGPT/Codex, or Nick —
can pick up where the last session left off. Read this and `MASTER_PROJECT_BRIEF.md`
(the authority) before starting work.

Last updated: 2026-07-20 (Claude / Opus).

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
- Implementation: `Telemetry` object near the top of the main `<script>` in `app/index.html`. Hooks: `Telemetry.startGame(names, rounds)` / `Telemetry.endGame(players)` at game start/end; `Telemetry.bump(key)` / `Telemetry.mark(type, detail)` at each event site (bumps accumulate into the current game record).

## Known open items

- **Residual hard stall** is still reachable: active player has empty hand, empty draw deck, and empty recycle pile (all cards locked in goals/discards/incomplete runs/The Brig). Player then can't draw and can't discard to end the turn. It is detected, logged, and **counted by the Tracker**, but NOT auto-resolved. Decision deferred: Nick wants to gather Tracker data on how often it happens before deciding a fix (candidate fix: recycle discard piles as a last resort, or a forced end-of-turn).

## Bigger direction (planning — not started)

- Investigating a conversion to **Next.js** with **true remote multiplayer** on a **Supabase (or similar) backend**.
- Nick has an **existing game project** with reusable multiplayer architecture/logic. Per `AGENTS.md`, the referenced repo is `NickBlackhall/studio` ("Make It Terrible") — patterns for room creation/join, room codes, Supabase realtime subscriptions, authoritative server actions, transition-state coordination, host departure/cleanup, reconnect handling, multiplayer browser tests, and PWA/Netlify config. Nick will share the repo link.
- Nick began planning this with another Claude instance on **2026-07-19** (the night before). A summary of that planning is still to be provided.
- Architecture prep per `AGENTS.md`/brief before integration: separate **game state / rules engine / validated actions / renderer**. Expected action types: `START_GAME`, `START_ROUND`, `PLAY_CARD_TO_RUN`, `DECLARE_KING`, `RESOLVE_JAILBREAK`, `DISCARD_CARD`, `END_TURN`, `COMPLETE_RUN`, `END_ROUND`. Authoritative host, player-specific views (private hands must never leak).

### What Claude needs from Nick to proceed on multiplayer
1. Link to the existing multiplayer repo (likely `NickBlackhall/studio`).
2. Any notes/summary from the 2026-07-19 planning chat.
3. A decision: keep the single-file v26 as the rules source for now, or start extracting a framework-independent rules engine from it as step one of the Next.js move.

## Change history

### 2026-07-20 (Claude / Opus) — pushed to main
1. `Restructure repo around v26 as the canonical build` — moved the v26 build into `app/`, archived v11 to `reference/`, tidied stray root files.
2. `Remove dead opening-King anchor code; audit card-supply rules` — deleted unreachable anchor code; added the King-supply/shuffle audit to the brief; ratified the recycle pile.
3. `Failed Jailbreak: reshuffle unplaced Kings into the draw deck` — removed the permanent Locker; kept 1-per-King penalty; updated player-facing text and the brief.
4. `Add offline playtest tracker for edge-case frequencies` — Telemetry module + hooks + MENU viewer.
5. Added `build-drop-zip.sh`, `.gitignore` (zip artifact), and this `WORKLOG.md`.
6. Upgraded the tracker to per-game records with Export (Copy JSON / Copy CSV / Download CSV) and Import/restore (merge, deduped; absorbs old V1 aggregate). Storage key bumped to `saltySchoonerTrackerV2`.

Note on process: earlier, a King-opener issue in the v11 file was fixed but then superseded when v26 became canonical — a reminder to always confirm which build is authoritative before editing.

## For ChatGPT / Codex working in this space

- Authority order (from `AGENTS.md`): `MASTER_PROJECT_BRIEF.md` → newer decisions approved by Nick → newest stable prototype → existing implementation.
- Canonical build is `app/index.html` on `main`. Don't create a parallel copy elsewhere.
- Rules are protected: don't change game rules/scoring/King/Jailbreak/etc. without Nick's explicit approval, and document any change in the brief.
- After editing `app/`, run `./build-drop-zip.sh` so the drop zip stays current.
- Append your changes to the Change history above so the next collaborator can follow.
