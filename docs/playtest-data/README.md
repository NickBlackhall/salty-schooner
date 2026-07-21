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
| `2026-07-21-phone-tracker-export.json` | 4 (all completed) | Phone. Its `since` is 2026-07-21, confirming a build drop reset it. Updated later the same day with 3 further games (`recent` trimmed; superset of the earlier 1-game version, see git history). |
| `2026-07-21-ipad-tracker-export.json` | 1 (in progress) | iPad. **The "endless round" game — see the section below.** Record is `current`, not yet in `games`. |

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

## First-player advantage (raised by Nick 2026-07-21)

Nick's read: *"I think player 1 has an advantage overall."* Proposed fix: rotate the starting
player each round — round 1 starts with P1, round 2 with P2, and so on.

**The code confirms the setup, and the data is suggestive but does not prove it.**

`startRound()` hardcodes `state.currentPlayer = 0` ([`app/index.html:2309`](../../app/index.html#L2309)),
so **Player 1 starts every round of every game**. That matters because a round is a race —
it ends the instant someone empties their HOLD pile, and the loser eats their remaining HOLD
as points. If P1 clears on their 12th turn, P2 has had only 11.

All completed games so far:

| Date | Config | Rounds | Duration | Runs | Jailbreaks | Winner | Scores | Ended early |
|---|---|---|---|---|---|---|---|---|
| 07-20 | 4 | 4 | 15m | 2 | 3 | P1 | 17, 26 | |
| 07-21 | 4 | 4 | 84m | 8 | 7 | P1 | 16, 26 | |
| 07-21 | 3 | 2 | 10m | 2 | 3 | **P2** | 17, **5** | clinch |
| 07-21 | 3 | 2 | 3m | 1 | 1 | P1 | **5**, 20 | clinch |
| 07-21 | 3 | 3 | 18m | 4 | 5 | P1 | 15, 19 | |

**P1 has won 4 of 5. That is not evidence yet** — a fair coin produces 4-or-more heads in 5
tosses **18.8%** of the time. Settling it statistically would take roughly 20+ games.

**Recommendation: make the change anyway.** The structural argument stands without the data,
rotating the starting player is standard practice in card games, and there is no downside. It
also removes a confound, so future games measure the game rather than the seat.

Wrinkle for later: with **3 players over 4 rounds** the rotation gives P1 two starts (P1, P2,
P3, P1). Not a reason to wait — just something to revisit if 3-handed play becomes common.

### The cheapest way to actually settle it: record round winners

The tracker stores only final game scores, so those 5 games yielded **5** data points. They
contained **15 rounds**. Recording the winner of each round would have given 15 — triple the
statistical power, from games already played, for one extra field. This is the single
highest-value telemetry addition for this question, and it belongs with the richer per-round
telemetry described further down.

## Other observations from the 2026-07-21 phone games

- **The clinch notice fired twice**, both with 1 round left, and both games were ended early.
  That feature (added 2026-07-20) is now confirmed working in real play.
- **Score margins are wide** — median 10 points, and two games saw a player finish on 5. Rounds
  are winner-take-most, because the round loser keeps their whole remaining HOLD pile.
- **Games are usually short.** 3, 10, 15, 18 minutes — with one 84-minute outlier. The
  "endless round" below is genuinely anomalous, not typical.
- **Jailbreak rate holds at 1.27 per round** (19 across 15 rounds), consistent with the earlier
  read. Still frequent enough to question build 13's dramatic build-up.
- **0 deck recycles, 0 hard stalls across all 5 completed games**, which makes the iPad game's
  2 recycles stand out further.
- **0 failed Jailbreaks in these 19.** Combined with earlier data that is roughly 1 failure in
  30 — the Curse of the Crown remains very nearly untested.

## The 2026-07-21 iPad game — the "endless round" (IMPORTANT)

Nick's note: *"genuinely the longest and most unenjoyable round I've played so far."* The
data agrees, and it points at a specific mechanism.

The record is still `current` (unfinished), sitting at **round 2 of 4** after starting at
22:11 and still going at 05:24 the next morning. In roughly a round and a half:

| | This game | Previous 2 games (8 rounds) |
|---|---|---|
| Runs completed | **9** | 10 |
| Deck recycles | **2 (74 cards)** | 0 |
| Jailbreaks | 4 (3 succeeded, **1 failed**) | 10 (10 succeeded) |

Two players is 104 cards, so **74 recycled means most of the pack cycled through twice
without the round ending.** High activity, no progress toward the actual win condition.

### Hypothesis: completing runs makes the board *harder* to play, and nothing forces an end

Two mechanisms, both visible in the code, that compound:

1. **Completed runs drain Kings out of circulation.** On completion, non-King cards go to
   the recycle pile ([`app/index.html:2263`](../../app/index.html#L2263)) but **Kings go to
   The Brig** ([`:2265`](../../app/index.html#L2265)). Recycled cards return to the deck when
   it empties ([`:2167`](../../app/index.html#L2167)); Brig Kings do not. Kings only leave the
   Brig via a Jailbreak, get played onto runs, and when those runs complete they go straight
   back to the Brig. So Kings cycle Brig → run → Brig and are rarely in anyone's hand.
   Kings are the wildcards that unstick an awkward HOLD top — as they concentrate in the
   Brig, HOLD piles get progressively harder to clear as the round wears on.
   Worse, it is self-reinforcing: a Jailbreak only triggers when a player *plays* a King
   onto a run ([`:2616`](../../app/index.html#L2616)), so the fewer Kings in circulation, the
   less often the Brig opens to release them.

2. **A completed run is replaced by an empty run, which is a narrower target.** An empty run
   accepts only an Ace or a Queen. A partially built run accepts its next value *and* a King.
   So each completion trades a flexible target for a restrictive one. Nine completions in a
   round and a half plausibly left the board sitting on empty runs waiting for A/Q.

3. **Nothing terminates the round.** Before the recycle pile, deck exhaustion ended things
   (badly — via the hard stall). The recycle pile fixed that, but the card loop is now closed:
   run → recycle → deck → hand → run. A round ends *only* when someone empties their HOLD
   pile. If HOLD tops are stuck, the game churns indefinitely. **0 hard stalls here is not
   good news** — it means the game never even reached the failure state we were watching for.
   It just kept going.

**This looks like the recycle-pile ratification's unintended consequence:** it converted a
hard stall (game breaks, obvious) into a soft stall (game continues, unenjoyable, invisible
to the tracker). Soft stalls are worse, because nothing flags them.

### Caveat on the hypothesis

This is inference from aggregate counters plus Nick's account. The tracker records *what*
happened, not the board state, so it cannot show whether runs really were sitting empty or
whether HOLD tops really were stuck. Confirming it needs either the richer telemetry below
or a deliberate replay. **Do not change a rule on this alone.**

### Also: the Curse of the Crown finally fired

`jailbreak-FAILED — 1 Kings, 1 penalty cards` at 22:43:46. First time in 14 recorded
Jailbreaks. The failure path — penalty card to the goal bottom, King reshuffled into the
deck, build 13's failure animation — has now executed once in real play without incident.

## What the tracker should record next

Nick: *"I wish your tracking was more detailed so you could see how it played out."* Agreed —
the current stats are lifetime counters, which show volume but not shape. To have diagnosed
the above from data alone, it would have needed:

- **Per-round timestamps and turn counts** — the single highest-value addition. "Round 1 took
  47 minutes and 63 turns" states the problem outright.
- **HOLD pile size per player at the end of each turn.** A flat line is the smoking gun for a
  stuck round, and it is one number per player per turn.
- **Turns where the player made no run play** (discard only) — the direct measure of "nobody
  could do anything."
- **Board snapshot at run completion** — how many runs were empty, how many Kings in the Brig.
- **Card counts by location over time** (deck / hands / HOLD / ports / runs / Brig) — would
  show the King drain into the Brig directly.

### Caveats

- Totals include abandoned games (2 of 4 records), so per-game averages skew low.
- Everything so far is 2-player, 4-round, default HOLD. No 3–4 player data at all.
- All of it predates build 14, so none of it reflects the voluntary hand refill.

## Later

`../MULTIPLAYER_PREP.md` notes a candidate fix: sync records to Supabase at game end
instead of relying on `localStorage`. That would merge all devices automatically and
survive build drops, and it does not require the multiplayer work — one insert-only table.
