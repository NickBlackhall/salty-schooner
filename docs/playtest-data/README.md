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
| `2026-07-20-tracker-export.json` | 3 (1 completed, 2 abandoned) | First export. 2-player, 4-round. See the read-out below. |

## Read-out as of 2026-07-20 (3 games, only 1 completed)

Far too small to conclude anything. Recorded so the next export can be compared against it.

| Stat | Total |
|---|---|
| Rounds started / completed | 6 / 4 |
| King-opener re-deals | 1 |
| Runs completed | 2 |
| Deck recycles | 0 |
| Jailbreaks triggered / succeeded / failed | 3 / 3 / 0 |
| Failed-Jailbreak Kings, Curse penalty cards | 0, 0 |
| **Hard stalls** | **0** |

Bearing on the open decisions in `../WORKLOG.md`:

- **Residual hard stall** — 0 in 4 completed rounds. Nowhere near enough to justify leaving
  it unresolved *or* fixing it. Needs many more games.
- **Failed Jailbreaks / Curse of the Crown** — 3 for 3 succeeded, so the entire failure path
  (penalty cards, Kings reshuffled into the deck) is **completely untested in real play**.
  Worth deliberately failing one to exercise it.
- **Deck recycles** — 0, so the recycle pile has never actually been reached either.
- **Abandoned games** — 2 of 3 records are abandoned mid-game. Expected during development,
  but worth knowing they're in the totals: lifetime sums include abandoned games, so
  per-game averages skew low.

## Later

`../MULTIPLAYER_PREP.md` notes a candidate fix: sync records to Supabase at game end
instead of relying on `localStorage`. That would merge all devices automatically and
survive build drops, and it does not require the multiplayer work — one insert-only table.
