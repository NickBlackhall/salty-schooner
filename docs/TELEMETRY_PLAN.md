# Telemetry plan

What the Playtest Tracker records, what it still should, and why. Written 2026-07-21 after
the "endless round" (see `playtest-data/README.md`) could not be diagnosed from the data —
the counters showed plenty of activity but nothing about the *shape* of a round.

**Principle: track questions, not fields.** Every item below exists to answer something
specific that is currently open. If a question closes, its telemetry can go.

## The questions

| Question | Answered by | Status |
|---|---|---|
| Why do rounds stall out and stop being fun? | Tier 1 | **The big one** |
| Does starting a round win it? | `roundLog` | Build 15, measuring |
| How often is the hard stall reachable? | `hardStalls` | Have it (0 so far) |
| Is 1.22 Jailbreaks/round too many for a set-piece? | Rate + Nick's judgement | Rate captured; feel is not data |
| Is the Curse too rare to matter (~1 in 30)? | `jailbreaksFailed` | Have it |
| Does anyone use build 14's declined draw? | `draws` per turn | Build 16 |
| Do 3-round games play better than 4? | Outcomes + Tier 4 | Partly |

## Tier 1 — the endless round (BUILT, build 16)

One compact record per turn (`turnLog`), which makes a round reconstructable.

| Field | Why |
|---|---|
| Turns per round, per seat | **The headline.** Cannot be inflated by idle time, unlike the clock. |
| `plays` / `dead` | A turn with no run play at all. Direct measure of "nobody could do anything." |
| `hold[]` — every seat's HOLD size at end of turn | A flat curve **is** the stall, visible at a glance. |
| Stall streak (derived) | Consecutive turns where no HOLD pile shrank. A long streak means the round is broken even if the clock says nothing. |
| `s`/`e` timestamps, capped at 3 min | Detects "we put it down", and lets play time be computed with idle removed. |
| `src` — hand / goal / port / brig | Where plays come from. A round living off ports is a different game from one living off HOLD. |
| `draws` | Whether build 14's voluntary refill is used or declined. |

Two Tier-2 fields were included because they cost two integers per turn and are the crux of
the endless-round hypothesis:

- `runs` — count of empty runs. Tests "completions swap flexible runs for A/Q-only ones."
- `brig` — Kings in the Brig. Tests "Kings drain out of circulation."

## Tier 2 — testing the King-drain hypothesis (NOT built)

- **Card census by location** per round: deck / recycle / hands / HOLD / ports / runs / Brig.
  Would show Kings concentrating in the Brig directly. Bonus: the total must stay constant,
  so it doubles as a detector for lost or duplicated cards.
- Run lengths at round end.

## Tier 3 — features shipped blind (NOT built)

- Jailbreaks: how many released Kings actually got played; turns taken to resolve.
- Rounds finished on an empty hand — did build 14 actually make the 0-point finish real?
- Clinch: how often, how early.

## Tier 4 — what counters cannot reach (NOT built)

Nick, on the endless round: *"it was genuinely stalled and we sort of lost interest."*

**Disengagement is the real failure mode and nothing detects it.** A hard stall is loud —
the game breaks and gets counted. This one was quiet: the game worked perfectly and stopped
being worth playing.

Candidate: a **one-tap thumbs up/down at round end**. It is the only proposed item that
measures whether a round was any *good*, as opposed to whether it functioned.

## Why Tiers 2–4 are deliberately deferred

`MULTIPLAYER_PREP.md` plans a rules engine that emits validated actions. **That action
stream is an event log.** Building elaborate telemetry now means building it twice — once
bolted onto `app/index.html`, once properly on the engine. Tier 1 is the exception because
the endless round is blocking a design decision today and the per-turn record stands alone.

## Format notes

- **Per-turn records, not a full event log.** ~195 bytes/turn as JSON; a 120-turn game is
  ~23KB. A full action log would be roughly 3× that and painful to move by copy-paste.
- **`Copy turns (CSV)` / `Download turns CSV`** emit the same data at ~64 bytes/turn (~8KB
  per game) and open directly in a spreadsheet. **Prefer CSV for sharing the turn log**;
  keep JSON for full restores, since Import/restore reads JSON.
- `MAX_TURNS` (600) caps the log so a pathological game cannot fill `localStorage`.
  Exceeding it sets `turnsTruncated` on the game record.
- Keys are deliberately short (`r`, `t`, `p`, `s`, `e`) because these get pasted by hand.

## Reading the data

A stalled round looks like this — the HOLD curve simply does not move:

```
round 1 (healthy):  10/10  10/9  9/9  9/9  8/9  8/8  8/8  8/7  7/7 ...
round 2 (stalled):  10/10 10/10 10/10 10/10 10/10 10/10 10/10 10/10 ...
```

In the Tracker, the numbers to watch are **DEAD turns** (red above 40%) and **longest stall
streak** (red at 12+). Both are lifetime figures across recorded games.
