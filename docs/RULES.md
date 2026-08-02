# Salty Schooner — Rules

**Status:** authoritative. This document is the source of truth for game rules.
**Baseline:** v26 · build 16 ("v26.16"), plus the changes in §13.
**Last updated:** 2026-08-02

When this document and any build disagree, **this document wins** and the build
is wrong. Neither `app/index.html` nor `netlify/functions/lib/engine.js` is the
reference any more — see §14 for where each currently conforms.

> Written by transcribing `netlify/functions/lib/engine.js`, which is itself a
> port of `app/index.html`. It has been reviewed against the code but **not yet
> ratified by Nick Blackhall**. Items marked **⚑** are ones the author is least
> confident are intended, as opposed to merely what the code does. Resolve those
> first; until then treat them as descriptive, not prescriptive.

---

## 1. Components

- **One standard 52-card deck per player.** Two players = 104 cards, three = 156.
  Suits ♠♥♦♣; ranks A(1) 2–10 J(11) Q(12) K(13).
- **4 shared Runs**, used by everyone.
- **The Brig**, a shared holding area for Kings.
- **The recycle pile**, shared, feeds the draw deck when it runs out.
- Per player: a **HOLD** pile (face-down, top card visible), a **hand**, and
  **4 Ports** (discard piles).

## 2. Match configuration

| Setting | Range | Default |
|---|---|---|
| HOLD cards per player | 5–20 | 10 |
| Rounds per game | 1–10 | 4 |

Values outside the range are clamped, not rejected.

## 3. Round setup

1. Build the deck (one per player) and shuffle.
2. **Remove one King and place it in the Brig.** The Brig always starts a round
   with exactly one King.
3. Reshuffle.
4. Deal each player their HOLD pile (default 10) and a hand of **5**.
5. Turn one card face up onto **Run 1**. If it is a King, return it, reshuffle,
   and draw again — repeat until it is not a King. **A King can never be the
   opening card.**
6. **Starting player rotates each round**: round 1 starts with seat 1, round 2
   with seat 2, and so on, wrapping around.

**⚑ Run 1's opener may be any non-King rank.** If it is not an Ace or Queen,
Run 1 begins with **no direction** and can later be driven either up or down.
Runs 2–4 begin empty and can only be opened with a natural Ace or Queen (§4).
This asymmetry is implemented in both builds; flagging it because it is not
obvious and may be an artifact rather than an intent.

## 4. Runs

A Run is a sequence built in one direction, either **up** (A→Q) or **down**
(Q→A). Kings are wild (§5) and never count as A or Q.

- **An empty Run may only be started with a natural Ace or Queen.** An Ace sets
  the direction up; a Queen sets it down.
- A Run holding exactly one card with **no direction yet** accepts either
  neighbour: one above (setting it up) or one below (setting it down). This only
  arises from Run 1's opener.
- Once a direction is set, only the next value in that direction is legal.
- **A Run is complete when a natural Queen lands on an ascending Run, or a
  natural Ace on a descending Run.** Because Kings can never represent A or Q,
  **only a natural card can complete a Run.**

### On completion ("safe harbor")

- Every **King** in the Run goes to **the Brig**, its wild value cleared.
- Every **non-King** card goes to the **recycle pile**.
- The Run is emptied and can be opened again with a natural Ace or Queen.

## 5. Kings

A King played to a Run is a **wildcard standing in for a numbered card**.

- **A King may only represent 2 through Jack** — never an Ace, never a Queen.
- **A King may never be played onto another King.**
- **A King may never open an empty Run.**
- When played onto a directed Run, the King takes the exact value the Run needs
  next, and **the player then declares the direction the Run continues** — either
  keeping the current direction or reversing it.
- When played onto Run 1's single undirected opener, the player chooses whether
  the King is one below (Run goes down) or one above (Run goes up), within the
  2–J limit.
- A King keeps its declared value for as long as it sits in the Run.

## 6. Jailbreak

### Trigger

A Jailbreak fires when **all four** of these hold as a King is played:

1. The King came from the player's hand, HOLD or a Port — **not** from Kings
   already released by an active Jailbreak.
2. The Run did **not** already contain a King before this play.
3. There is **at least one King in the Brig**.
4. **No Jailbreak is already active.**

Every King in the Brig is released to the acting player for **that turn only**.

### Resolving it

- Released Kings may be played to Runs like any other King, subject to §5.
- **Success:** all released Kings are played. The Jailbreak closes cleanly.
- **Failure — Curse of the Crown:** the player ends their turn (discards) while
  released Kings remain unplayed. For **each** unplayed King:
  - one card is drawn and added to the **bottom of that player's HOLD pile**;
  - the King is returned to the **draw deck**, which is then reshuffled.

  The penalty card is drawn **before** the Kings return to the deck, so a
  returned King cannot immediately come back as a penalty card.

**⚑ Curse penalties can un-win a round.** Penalty cards land in HOLD, so a player
who cleared their HOLD and then failed a Jailbreak on the same turn no longer has
an empty HOLD and does not win. This falls out of the ordering in the code and
looks intentional, but confirm it.

**⚑ A second Jailbreak in one turn is possible.** Condition 4 only blocks a
Jailbreak while one is *active*. If a Jailbreak completes, and a Run then
completes and sends a King to the Brig, a further King play could trigger a new
Jailbreak in the same turn. Rare, but reachable. Confirm whether "the Brig
springs once per turn" is meant to be a hard limit.

## 7. A turn

On your turn you may, in any order and any number of times:

- play cards to Runs from your **hand**, the **top of your HOLD**, the **top of
  any of your Ports**, or **released Jailbreak Kings**;
- **draw**, when eligible (§8).

**A turn ends only by discarding one card from your hand to one of your four
Ports.** The discard is mandatory and must come from hand, so **a turn can never
end with an empty hand** — you must draw before you can finish.

Playing from HOLD is the only way to reduce your HOLD pile, and clearing it is
how a round is won.

## 8. Drawing (changed — see §13)

Nothing is ever drawn automatically. There are exactly two ways to draw:

**1. Start-of-turn top-off.** At the moment your turn begins, your allowance is
`5 − (cards in hand)`. It is calculated once and **never recalculated**. You may
spend it at any point during your turn, but playing cards first does not enlarge
it.

> Start your turn with 4 cards → allowance is 1. Play a card, down to 3. The
> allowance is **still 1**: drawing brings you to 4, not 5.

**2. Cleared hand.** When your hand reaches zero **and your allowance is already
spent**, you earn a fresh hand of 5. This is repeatable — a long turn can clear
your hand more than once.

The "allowance already spent" condition is the part most easily got wrong.
Clearing your hand does **not** upgrade an outstanding allowance:

> Start your turn with 3 cards → allowance is 2. Play all 3. Your hand is empty,
> but you are still owed only **2**, not 5. Draw those 2 and play them as well —
> *now* your hand is clear with nothing outstanding, so you draw a fresh 5.

A fresh hand is therefore earned by playing out everything you were entitled to
(3 + 2 = five cards, in that example), not by declining to draw at the right
moment. **Maximum hand size is 5 at all times.**

On the opening deal everyone holds 5, so the first turn of a round has an
allowance of zero — and a player who plays all five clears their hand with
nothing outstanding, so they earn a fresh 5.

Ending your turn requires discarding a card from hand, so the next turn's
allowance follows automatically: discard down to 1 card and you begin your next
turn owed 4.

## 9. Ports

Four discard piles per player.

- Discarding one hand card to a Port is how you **end your turn**.
- The **top card of any of your Ports may be played to a Run** on a later turn.
  Ports are not a graveyard; cards can come back out.

## 10. Running out of cards

When the draw deck empties, the **recycle pile is shuffled into a new draw
deck**. If both are empty, no cards can be drawn. A player with an empty hand and
nothing to draw cannot discard and therefore cannot end their turn — a **hard
stall**.

## 11. Ending a round and scoring

A round ends **the instant a player's HOLD pile is empty**.

Every player scores, including the winner:

```
round score  =  cards left in HOLD  +  cards left in hand
```

Scores accumulate across rounds. **Lowest total wins.** The round winner scores
whatever remains in their hand, so a player who plays out their hand before
winning finishes closer to zero.

## 12. Ending a game

The game ends after the configured number of rounds. Lowest total wins.

**Clinch:** after each round the game checks whether a player is mathematically
uncatchable — their worst case (gaining `HOLD size + 5` every remaining round)
still beats every opponent's best case (gaining 0). If so, the host may end the
game early or keep playing. The `+5` is the maximum hand size from §8.

## 13. Change log

### 2026-07-29 — hand refill is always the player's choice
*Approved by Nick Blackhall. Multiplayer builds only.*

**Was:** every turn ended with an automatic refill to 5.

**Now:** §8 — a fixed start-of-turn allowance plus an empty-hand draw, both
optional.

**Why:** scoring counts hand cards, so the forced refill meant every player who
did not win a round scored their HOLD *plus exactly 5* — a penalty they never
chose, and a scoring term that was identical for everyone but the winner, so it
distinguished nothing. It also let a player claim cards from the shared deck at
the *end* of their turn, where they sat unusable through everyone else's turns.

This extends the existing build-14 principle ("refilling mid-turn is the player's
call") to close the turn-end loophole that reintroduced a forced refill.

### 2026-08-02 — a cleared hand only pays out once the allowance is spent
*Approved by Nick Blackhall. Multiplayer builds only.*

**Was:** an empty hand granted a fresh 5 outright, whatever was left of the
start-of-turn allowance.

**Now:** §8 — a cleared hand earns 5 only when the allowance is already spent.
Clear it with 2 still outstanding and you are owed those 2, not 5.

**Why:** the old wording made "empty your hand before you draw" a dominant line
with no cost attached:

| Holding 3 (allowance 2) | Cards played | Ended up with |
|---|---|---|
| draw the 2 first, then play 3 | 3 | a hand of 2 |
| play all 3 first, then draw | 3 | a hand of **5** |

Identical play, but declining to draw first paid five cards instead of two, so
there was never a reason to draw before emptying your hand — a trick that
rewarded knowing it rather than playing well. A fresh hand is now earned by
playing out everything you were entitled to.

**Known tradeoff, accepted:** this is harsher on a bad draw. Clear your hand,
take your 2, and if both are unplayable the turn ends there — where the old rule
handed you 5 to hunt through.

**Found by:** real play, and raised by Nick as a discrepancy with how the table
version was being played.

## 14. Build conformance

| Build | Conforms to | Notes |
|---|---|---|
| `netlify/functions/lib/engine.js` (multiplayer) | All of §1–§12 | Current. |
| `app/shared/engine.js` | — | Byte-identical copy of the above, served to browsers for legality hints. **Keep in sync.** |
| `app/index.html` (hot-seat) | §1–§12 **except §8** | **Frozen at v26.16 by decision, 2026-07-29.** Still auto-refills to 5 at end of turn, and has neither the 2026-07-29 nor the 2026-08-02 change. The gap is now two rule changes wide. Deliberate, not drift — do not "resync" the engine to match it. |

## 15. Non-rules implementation notes

- `state.pendingWinner` is set when a player clears their HOLD during an active
  Jailbreak, but the win is actually detected by re-checking for an empty HOLD on
  a later action. The field is effectively vestigial; it carries no rule.
- Card `id`s come from a counter that restarts when a serverless instance goes
  cold, so ids are unique **within a game state**, not globally.
