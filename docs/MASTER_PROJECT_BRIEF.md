# Salty Schooner Master Project Brief

**Status:** Active prototype  
**Latest stable build:** v26 Tappable Runs (`app/index.html`)  
**Owner:** Nick Blackhall

## Project Purpose

- Salty Schooner is a competitive, multiplayer Solitaire-style family card game with a nautical/pirate identity. The current product is a browser-playable prototype used to validate the rules before integrating the game into an existing multiplayer architecture.
- Primary design goal: easy to understand, hard to master. Do not add new mechanics unless Nick explicitly approves them.

## Current Stable Build

- Latest build: v26 Tappable Runs, internal version string `v26-configurable-match`.
- Canonical location in this repo: `app/index.html` (with `app/assets/`). This is the build deployed to Netlify.
- Format: single-file HTML plus art/audio assets, two-player tabletop mode, optimized for landscape iPad play.
- v26 uses a tap-to-play interaction on the Runs (earlier builds used select-card-then-"Play here").
- Current prototype is hot-seat only. It does not yet include networking or hidden private hands.
- Older prototypes are archived under `reference/` (e.g. `reference/salty_schooner_v11_ipad_fit.html`).
- NOTE: builds v12 through v26 were produced in separate ChatGPT sessions and pushed straight to Netlify. Only v11 and v26 exist locally; the intermediate builds were not preserved.

## Game Goal and Scoring

- The game lasts 4 rounds.
- A round ends immediately when any player clears their goal pile.
- At the end of a round, each player receives 1 point for every card remaining in their goal pile and 1 point for every card remaining in their hand.
- Discard piles do not count toward scoring.
- Lowest cumulative score after 4 rounds wins.

## Deck and Round Setup

- Use one standard 52-card deck per player, with no jokers. All decks are shuffled together.
- At the start of each round, remove one random King and place it face-up in The Brig.
- Shuffle the remaining cards again.
- Deal each player a 10-card goal pile. Only the top goal card is available to play.
- Deal each player a 5-card hand.
- Deal one opening card face-up into Run 1.
- The opening card may not be a King. If a King is drawn for the opener, return it to the deck, reshuffle, and draw again.
- The remaining cards form the draw deck.
- Each player has four personal discard piles.
- There are four shared runs.

## Turn Structure

- On a turn, a player may make any number of legal plays from the top of their goal pile, their hand, or the top of one of their own discard piles.
- If the player empties their hand during the turn, they immediately draw 5 more cards and continue.
- To end the turn, the player must discard one card from their hand onto one of their four discard piles.
- After discarding, the player draws back up to 5 cards.
- Only the top card of each discard pile is playable.

## Run Rules

- Runs are shared by all players.
- Upward sequence: Ace, 2, 3, 4, 5, 6, 7, 8, 9, 10, Jack, Queen.
- Downward sequence: Queen, Jack, 10, 9, 8, 7, 6, 5, 4, 3, 2, Ace.
- An upward run completes with a natural Queen.
- A downward run completes with a natural Ace.
- Normal empty runs may only begin with a natural Ace or natural Queen.
- The opening Run 1 may begin with any dealt card. If it begins with a middle card, its direction remains unset until the next legal card or King establishes direction.

## King Rules

- Kings are restricted wild cards.
- A King may represent values 2 through Jack only.
- A King may not represent Ace or Queen.
- A King may not start a run.
- A King may not complete a run.
- When a King is played, the player declares the represented value and the direction of the run.
- Kings set the direction of the run.
- The King's represented value must be numerically adjacent to the run's current top card (the same value that would be required to continue the run's existing direction, if one is already established). The player may then declare either direction going forward, regardless of the run's prior direction — a King can act as the "peak" where an ascending run reverses to descend, or vice versa. This is the player's choice, made freely at the time the King is played.
- During normal play, a King may not be played directly on top of another King.
- Multiple Kings may appear in the same run as long as they are not directly adjacent, except during a Jailbreak.

## The Brig

- The Brig is a shared holding area for Kings.
- The Brig begins every round with one face-up King.
- When a run completes, all Kings in that run are moved to The Brig.
- All non-King cards from a completed run are discarded out of play.
- The cleared run becomes available for a new run.
- DISCREPANCY (needs Nick's decision): the v26 build does NOT discard completed-run non-King cards out of play. Instead it moves them to a "recycle pile" (`state.recycle`). This rule change was introduced in a ChatGPT session and is not yet ratified here. Decide whether the recycle pile is official; if so, document how/when the recycle pile re-enters play.

## Forced Jailbreak

- A Jailbreak is mandatory, not optional.
- A Jailbreak triggers when a player plays the first King into a particular run and The Brig contains one or more Kings at that moment.
- The King played from the player area is called the Key King.
- The Key King must be a legal next sequential value in the target run.
- After the Key King is placed, the player must legally play every King currently in The Brig during the same turn.
- Brig Kings may be distributed across any legal runs.
- During a Jailbreak only, a Brig King may be played directly on top of the Key King if it represents the next legal sequential value.
- This is the only permitted back-to-back King exception.
- A later King played into a run that already contains a King does not trigger a new Jailbreak.

## Failed Jailbreak and Curse of the Crown

- A Jailbreak fails if every King from The Brig cannot be legally placed.
- On failure, remove the Key King from the run and place it into The Brig.
- Restore the affected run exactly to its state before the Key King was played.
- Deal 2 cards from the draw deck face-down to the bottom of that player's goal pile.
- The player's turn continues after the penalty if legal plays remain.

## Confirmed Playtest Behavior

- Forced Jailbreak triggers when The Brig is occupied and the first King is played into a new run.
- A successful Jailbreak can release multiple Kings from The Brig and distribute them across multiple runs.
- Normal King-on-King play is blocked.
- Failed Jailbreak restoration was previously broken but was patched so the run returns to its true pre-Key-King state.
- The current rules engine is considered playtestable, though not fully proven.

## Known Design Questions to Watch

- Does Forced Jailbreak feel strategic and understandable, or random and punitive?
- Does requiring every Brig King to be played become too difficult when The Brig contains several Kings?
- Does Curse of the Crown create runaway losses for a player who is already behind?
- Does first-player position create a meaningful advantage?
- Do players intentionally manage discard piles, or do turns still feel mostly driven by luck?
- Does completing a run with several Kings create satisfying tension or excessive Brig buildup?

## Current Skill-versus-Chance Assessment

- Current rough estimate: 55-65 percent chance and 35-45 percent skill.
- Major chance sources are randomized hands, randomized goal piles, opening-card state, and card access order.
- Major skill sources are sequencing plays, managing four discard piles, controlling shared runs, deciding when to expose goal cards, timing Kings, evaluating Jailbreak risk, and avoiding setups that benefit the opponent.
- The strongest potential mastery layer is long-term discard management combined with King and Jailbreak timing.

## Tabletop User Interface Direction

- The two-player iPad layout is designed for the device to sit between players.
- Player 2 faces the top edge and is rotated 180 degrees.
- Runs 1 and 2 face Player 2 and sit near the center.
- Runs 3 and 4 face Player 1.
- The Brig sits in the middle.
- The active player is shown by an outline around that player's area; a separate current-turn banner is unnecessary.
- Selected-card details, full log, Force End Turn, state controls, and test tools belong inside a collapsed Tools / Log or Debug drawer.
- The game should be launched from an iPad Home Screen icon when hosted online to minimize Safari browser controls and maximize usable space.

## Version History

- v3: Fixed Safari failure caused by declaring a global function named `top`.
- v4: Blocked normal back-to-back King plays.
- v5: Fixed failed-Jailbreak rollback and ghost-Key-King state.
- v6: Added save/load, export/import, state validation, force-card testing, and debug state inspection.
- v7-v10: Developed and refined the two-player mirrored tabletop layout.
- v11: Tightened the layout for landscape iPad use and added Home Screen / PWA-friendly metadata.
- v12-v25: Iterated in separate ChatGPT sessions (not preserved locally). Known additions by v26 include configurable match settings, a recycle pile for completed-run cards, and art/audio assets.
- v26: "Tappable Runs" — tap-to-play interaction. King-opener rule changed here to re-deal (a King is never the opening card; if drawn it returns to the deck and another is dealt). Earlier v26 had treated an opening King as a wildcard anchor; that approach is now retired.

## Multiplayer Architecture Direction

- Nick already has working multiplayer architecture in another, more complex game project. Do not build a replacement networking stack from scratch.
- Before integration, separate the game into game state, rules engine, validated actions, and renderer/UI.
- Expected action types include `START_GAME`, `START_ROUND`, `PLAY_CARD_TO_RUN`, `DECLARE_KING`, `RESOLVE_JAILBREAK`, `DISCARD_CARD`, `END_TURN`, `COMPLETE_RUN`, and `END_ROUND`.
- The multiplayer host or server should be authoritative: receive an action, validate it, update state, and broadcast player-specific views.
- Private hands are the main visibility requirement. Each player should see only their own hand, while goal pile top cards, discard tops, runs, The Brig, scores, and card counts remain public.

## Working Instructions for Future Sessions

- Treat this brief and the newest stable HTML build as authoritative.
- Do not silently change established rules.
- Distinguish rules-engine bugs from layout bugs and networking bugs.
- Prefer reproducible test setups and exported state over guessing.
- When a bug appears, preserve the state before further moves whenever possible.
- Keep responses direct, practical, and iterative.
- Prioritize completing full rounds and measuring fun before adding theme, animation, or online multiplayer.

## Immediate Next Steps

- Play at least one complete two-player round on the iPad using v11.
- Record moments that are confusing, tedious, unexpectedly lucky, or strategically satisfying.
- Test completion of runs that contain multiple Kings.
- Test a failed Jailbreak after the target run already has an established direction.
- Confirm round-end scoring and transition through all 4 rounds.
- After a successful full-game playtest, refactor the single-file prototype into a reusable rules engine and UI layer suitable for the existing multiplayer project.
