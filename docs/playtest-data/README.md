# Playtest data

Tracker exports, kept here because the in-game Tracker cannot survive on its own.

It lives in `localStorage`, which means the record is per-device *and* per-URL. Phone,
iPad, and computer each keep a separate record, and **every new Netlify Drop URL starts
empty** — so shipping a build wipes it. This folder is the durable archive.

## How to add an export

1. In-game **MENU (☰) → 📊 Tracker**, or the **Playtest Tracker** button on the setup screen.
2. **Copy all (JSON)**.
3. Save it here as `YYYY-MM-DD-tracker-export.json`, optionally with the device
   (`2026-07-20-ipad-tracker-export.json`) when more than one device is in play.
4. Commit.

Exports are additive, not replacements — keep the old ones. The Tracker's **Import/restore**
merges and dedupes by game id, so re-importing an old file is always safe, and merging
several devices into one record works by importing each in turn.

## What's here

| File | Games | Notes |
|---|---|---|
| `2026-07-20-tracker-export.json` | 3 (1 completed, 2 abandoned) | First export. 2-player, 4-round. |
| `2026-07-21-phone-tracker-export.json` | 1 (completed) | Phone. Separate record — its `since` is 2026-07-21, confirming a build drop reset it. |

## Read-out as of 2026-07-21 (4 games, 2 completed, 8 rounds)

Still a tiny sample — nothing here settles a decision. But two things already look like
signals rather than noise, because they held across two independent sessions on two devices.

| Stat | Total |
|---|---|
| Rounds completed | 8 |
| King-opener re-deals | 1 |
| Runs completed | 10 |
| **Deck recycles** | **0** |
| Jailbreaks triggered / succeeded / failed | **10 / 10 / 0** |
| Failed-Jailbreak Kings, Curse penalty cards | 0, 0 |
| **Hard stalls** | **0** |

Per completed game:

| Game | Duration | Runs | Jailbreaks | Scores |
|---|---|---|---|---|
| 2026-07-20 | 15m | 2 | 3 (3/0) | 17, 26 |
| 2026-07-21 (phone) | 85m | 8 | 7 (7/0) | 16, 26 |

### What it suggests

- **Jailbreaks are common, not a set-piece — 1.25 per round, 10 across 8 rounds.** The phone
  game triggered 7 in four rounds. Build 13 gave the Jailbreak a ~1.1s shake/glow/riser
  build-up on the assumption it is a dramatic rarity. At this frequency that is roughly 8
  seconds of build-up per game, and the drama likely dilutes. Worth Nick's judgement on
  device: does it still land the seventh time?
- **The failure path has never fired. 10 for 10 succeeded.** The whole Curse of the Crown
  design — penalty cards to the goal bottom, Kings reshuffled into the deck, ratified
  2026-07-20 — is **untested in real play**, and so is the failure branch of build 13's
  resolution animation. Worth deliberately failing one to exercise it end to end.
- **The recycle pile has never been reached either** (0 recycles in 8 rounds), so the
  deck-exhaustion fix it was ratified for is likewise unexercised.
- **Hard stalls: 0 in 8 rounds.** Two independent sessions at zero is weak evidence that it
  is genuinely rare, but nowhere near enough to close the deferred decision.
- **Watch seat order.** Player 1 won both games, and Player 2 scored exactly 26 both times.
  Almost certainly coincidence at n=2 — but a first-seat advantage is worth ruling out,
  and it costs nothing to keep an eye on as more games land.
- **Duration varies 5.5x** (15m vs 85m) for the same 2-player, 4-round config. Probably
  interruptions rather than the game itself, but worth confirming.

### Caveats

- Totals include abandoned games (2 of 4 records), so per-game averages skew low.
- Everything so far is 2-player, 4-round, default HOLD. No 3–4 player data at all.
- All of it predates build 14, so none of it reflects the voluntary hand refill.

## Later

`../MULTIPLAYER_PREP.md` notes a candidate fix: sync records to Supabase at game end
instead of relying on `localStorage`. That would merge all devices automatically and
survive build drops, and it does not require the multiplayer work — one insert-only table.
