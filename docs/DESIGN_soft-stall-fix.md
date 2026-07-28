# Design thread: fixing the soft stall (jokers / Brig) — OPEN, NO DECISION, NO CODE

Status as of 2026-07-22. This is an **exploratory design discussion**, not a plan. Nothing
here is implemented and no rule has changed. It records the reasoning so the eventual fix (if
any) rests on written argument, not memory. Any rule change still needs Nick's explicit
approval and its own brief entry.

Root-cause analysis lives in `MASTER_PROJECT_BRIEF.md` → "The Soft Stall — root-cause
analysis". This file is the *fix-direction* brainstorm that followed it.

## The design goals (Nick's, 2026-07-22)

1. **Fix the soft stall** — confirmed in build-16 telemetry: ~26% dead turns, "stall then
   avalanche", caused by Kings draining into the Brig (a sink) faster than they return.
2. **Keep the Brig as a high-risk / high-reward mechanic.** Nick explicitly values it: a
   skilled player can exploit a full Brig for big plays, and it punishes weaker players. The
   Brig/Jailbreak is a **keeper** — this rules out any fix that guts it.
3. **Own identity — NOT a Skip-Bo clone.** Use Skip-Bo and Spite & Malice as foundations, but
   the game must have its own mechanics. "Who cares about another Skip-Bo?"
4. **Must be playable physically with real cards, easily.** No hidden state, no turn-counting,
   nothing a table of humans can't just pick up and do.

## Options considered, with verdicts

- **Version A — Brig becomes a face-up King bank, top King playable on your turn.** Physically
  trivial, math bounded. BUT it retires the Jailbreak (the vault stops being locked). **Rejected**
  because goal #2 — the Jailbreak is a keeper.
- **Version B — Brig is a pile whose top card is wild regardless of rank.** **Rejected**: fails
  the physical test (a face-up 6 "secretly wild right now" is a constant gotcha at a table) and
  manufactures wilds out of non-wild cards (math inflation, plus a new sink).
- **Auto-release on a turn counter.** **Rejected**: someone has to count turns at the table.
  Threshold-based release (visible Brig size) is the only physically acceptable form, and even
  that is awkward ("release to where, played by whom").
- **Jokers as a circulating wild (pure Skip-Bo model).** Works, physically proven (jokers are
  real cards), leaves the Brig untouched. But on its own it's the "clone" path — not enough
  identity. Became the seed for the idea below.

## The current front-runner: the Joker as a Brig-buster

Nick's idea, and the most promising direction. A **Joker busts open the Brig** — forces a
Jailbreak.

**Key insight (why this is a real fix, not just flavour):** the stall is caused by Kings stuck
in the Brig. Busting the Brig **flushes it back into circulation** — released Kings get played
onto runs, or (if the target can't play them) the Curse fires and unplayed Kings reshuffle into
the deck. **Either outcome un-drains the Brig.** So the Joker-buster is a player-controlled,
skill-based, dramatic pressure-release valve on the exact sink that causes the stall. That is
Salty Schooner's *own* mechanic, not a Skip-Bo import.

Self-scaling bonus: more players → more decks → more Kings → fatter Brig, so the buster gets
stronger in exactly the games where the drain is worst. (Also swingier — a 5-player bust could
dump 4–5 Kings on a victim at once.)

### Two open sub-questions (unresolved)

**Q1. Does the Joker do only the Brig-bust, or is it also a plain wild playable on a run?**
- Buster-only = clean identity, single purpose.
- Dual-use (wild on a run OR spend to bust) = more player choice / skill expression, and it
  also fixes the *other* half of the stall (empty runs needing A/Q), which the buster alone does
  not. Undecided.

**Q2. Who can play a Joker, and when? (the turn-timing question — the big one)**

Three models, with a critical physical-vs-digital tension:

| Model | Physical table | Online (planned future) | Feel |
|---|---|---|---|
| **M1 — own turn only** (bust the Brig on yourself) | trivial | trivial | tame, no sabotage |
| **M2 — targeted, resolves on victim's turn** | easy | very doable | tense, fair, sabotage without interrupts |
| **M3 — true interrupt** (anyone drops a Joker mid-turn) | **easy & thrilling** | **hardest thing to build** | chaotic, swingy |

**THE TRAP:** on a physical table M3 is *easier* than M2 (no sync — just drop the card and
react). Online, M3 is the single biggest complexity jump available. The whole planned
architecture (`MULTIPLAYER_PREP.md`) assumes *"only the active player can move"*; true
interrupts blow that up (race conditions, timing windows, response prompts) — the line between
turn-based netcode (a weekend) and real-time interactive netcode (a different project).
**This must be decided BEFORE multiplayer is built, not after** — designing the interrupt in
physically and porting later is exactly what would break the port.

Nick's attraction is specifically the mid-turn slap-down ("drop a joker in the middle of
someone else's turn to sabotage them") — which is M3. M2 keeps the sabotage but loses that
specific interrupt thrill. Undecided.

### Honest flags to weigh

- **Take-that / kingmaking.** Direct sabotage in 4–5 player games invites pile-ons on the leader
  and a losing player spoiling for a friend. Some groups love it, some find it feel-bad. It's a
  personality being chosen, not a neutral mechanic.
- **Swinginess** of a multi-King bust (see self-scaling above).
- **Test before committing.** The stall is confirmed but no *fix* has been tested. Whatever is
  chosen, play 2–3 build-16 games with it and watch the dead-turn rate drop in the Tracker
  before it goes into the rules.

## Where this connects

- The M3-vs-turn-based decision directly constrains the **multiplayer architecture** — see
  `MULTIPLAYER_PREP.md`. Flag it there when a direction is chosen.
- Jackbox-style local play mode (started 2026-07-22) may change the calculus: a single shared
  screen + phone controllers is a different networking model from full remote multiplayer, and
  interrupts may be cheaper or dearer depending on which is built first.
