# Rules vs. Looks — a sorting map of `app/index.html`

Companion to `docs/MULTIPLAYER_PREP.md`, item #1 ("separate the rules from the
looks"). This is a checklist for a future coding session: every function in the
game sorted into three piles so the separation work is a clear to-do list instead
of one big scary job. Written 2026-07-20 against v26 · build 9.

**How to read this:** three piles.
- **Pile A — Rules (the engine).** The game's truth. This is what moves to the
  server. Already mostly clean; easy to move.
- **Pile B — Looks (the screen).** Drawing, sound, animation, menus. Stays in the
  browser. Never moves to the server.
- **Pile C — Mixed (the actual work).** Functions that do *both* at once. Each one
  needs a light split: keep the rule part, move the drawing/sound part out. This
  pile is 90% of the effort — and it's all small, mechanical edits.

---

## Pile A — Rules (the engine). Moves to the server, barely touched.

These already compute the game's truth without touching the screen. The clean core.

- `VALUES`, `VALUE_NAMES`, `SUITS`, `RED`, `MATCH_LIMITS` — the basic facts (card
  values, suits, limits).
- `makeDeck`, `shuffle` — build and shuffle the deck. *(One change needed — see
  "Shuffle" below.)*
- `topCard`, `currentPlayer`, `hasKing`, `runLastValue` — small lookups.
- `nextValuesForRun`, `kingRequiredValue`, `unsetNaturalKingChoices` — "what can
  legally come next on this run."
- **`canPlayCardOnRun`** — the heart: is this move legal? Already pure. 
- `naturalCompletesRun` — does this card finish a run.
- `clampMatchNumber`, `normalizeMatchConfig`, `activeMatchConfig`,
  `createMatchState` — set up a match's rules/settings.
- **`clinchedPlayer`** — the "game already decided" math. Already pure. 
- `failActiveJailbreak` — the Curse-of-the-Crown penalty math. Almost pure (only a
  couple of log lines to lift out).
- `drawTo` — deal N cards to a player. Pure.

## Pile B — Looks (the screen). Stays in the browser. Never moves.

Pure presentation — drawing, sound, animation, menus, diagnostics tooling.

- **Drawing:** `render`, `renderCard`, `renderScoreboard`, `renderRuns`,
  `renderPlayerArea`, `renderBrig`, `renderSelected`, `renderLog`.
- **Pop-ups / feedback:** `showModal`, `hideModal`, `flashIllegalRun`.
- **Selection UI:** `selectCard`, `getSelectedCard`, `removeSelectedCard`,
  `undoAddSelected` (these revolve around `selected`, a screen-only idea — see
  "The `selected` idea" below).
- **Music:** `activeMusic`, `updateMusicToggle`, `playActiveMusic`,
  `setMusicContext`, `startBackgroundMusic`, `toggleBackgroundMusic`.
- **Sound effects:** `emitSoundCue`, the SFX manager block, `saltyTauntCheck`.
- **Jailbreak splash/animation:** `showJailbreakSplash`, `finishJailbreakSplash`,
  `showJailbreakResolution`, `finishJailbreakResolution`.
- **Turn hand-off screen:** `beginTurnHandoff` (the "pass the phone" countdown —
  see "Hand-off" below; this whole idea likely disappears online).
- **Setup menu:** `setupInputs`, `readSetupMatchConfig`, `syncSetupMatchControls`,
  `adjustSetupMatchValue`, and the button click handlers near the bottom.
- **The extra `<script>` blocks** (card-flip animation, port fan, etc.) — all
  screen polish.
- **Playtest tracker** (`Telemetry` object, `trackerCopy`, `trackerDownload`,
  `showTelemetry`) — diagnostics. Its own separate concern; online it becomes a
  database table (see "Tracker" below), so leave it be for now.

## Pile C — Mixed (THE WORK). Each needs a small split.

These do a rule **and** a screen thing in the same breath. The pattern for every
one is the same: **let the function change the game's truth, then let the caller
redraw** — instead of the function redrawing itself. Small, mechanical edits.

| Function | Rule part (keep) | Screen part to lift out |
|---|---|---|
| `drawCard` | pop a card, recycle when empty | `log(...)`, `Telemetry` calls |
| `checkComplete` | clear a finished run, send Kings to brig | `log(...)`, `Telemetry` |
| `startRound` | deal a new round | `render()`, `log(...)`, `Telemetry` |
| `startGame` | make state + start round | hide/show screens, start music |
| `playSelectedToRun` | place card, set direction | reads `selected`, sound, `log`, `render` |
| `afterPlay` | end-of-move flow (win? refill? jailbreak done?) | `render()` |
| `commitKing` | place King, maybe trigger jailbreak | sound, `log`, `render` |
| `beginJailbreak` | release the brig | `render()`, splash animation |
| `completeActiveJailbreak` | close out a won jailbreak | `render()`, brig animation, overlay |
| `discardSelectedTo` | discard, resolve jailbreak, end turn | sound, `log`, animation, hand-off |
| `endRound` | tally scores, advance round | `render()`, the score `showModal` |
| `endGame` | final ranking | the `showModal` |
| `nextTurn` | advance to next player | `render()` |
| `trackNoDrawStall` | detect a stuck game | `log`, `Telemetry` (diagnostic) |
| `log` | (add to history) | `renderLog()` |

---

## Four special call-outs (the non-mechanical bits)

### 1. The King "which direction?" pop-up — the one real online blocker
`handleKingPlay` and `handleUnsetNaturalKingPlay` stop the game, pop up a menu, and
wait for the player to tap a choice, then call `commitKing`. **This is the only spot
that genuinely can't cross the network as-is** — another player's phone can't answer
your pop-up. The fix (prep doc item #2): playing a King should leave the game in a
"waiting for [player] to choose a direction" state; that player's screen shows the
choice; they send a separate `declareKing` move. Turn the pop-up into a real move.

*(The Round-Over / clinch / Game-Over pop-ups in `endRound`/`endGame` are different —
those are just the host clicking "next." They become server-driven prompts, no
special handling.)*

### 2. The shuffle needs to be repeatable
`shuffle` uses `Math.random`, which can't be reproduced. The server needs a shuffle
it can re-create from a saved "seed" so (a) players can't peek at or predict the
deck, and (b) a stuck game can be replayed exactly. Small swap: a seeded shuffle,
seed stored in the game's state. (Bonus: makes the stall snapshots reproducible.)

### 3. The `selected` idea goes away online
Right now a move is two steps: tap a card (sets `selected`), then tap a run. That
"selected" card lives only on the one device. Online, a move arrives in one piece —
"player X plays card #123 to run 2" — so the rule functions should take the card as
an argument instead of reading `selected`. The selection dance stays in the browser
(Pile B); the engine stops knowing about it.

### 4. The tracker becomes a database table
`Telemetry` already records per-game stats and can export/import JSON. Online, that
same information naturally lives in a `game_events` / records table (see
`MULTIPLAYER_PREP.md` appendix). No work now — just know the shape already matches.

---

## One decision to make later (not now)

The current game shows **one** hand at a time (whoever's turn it is) and passes the
phone. Online, each player is on their own device. Confirmed model (Nick, 2026-07-20):
**each player always sees their own hand, and only the active player can make a move**
— everyone else watches the board update live. That drives the "secret vs. shared"
split (prep doc item #5):

- **Secret to each player:** your hand, and your goal-pile contents.
- **Shared with everyone:** the runs, the brig, scores, whose turn it is, and pile
  *sizes* (how many cards someone holds).
- **Ports (discard piles) — a middle case:** in a physical game they're visible to
  everyone; the current build only shows the active player's ports. For now treat
  their *contents* as not-shown, but they're the natural first thing to make
  peekable — a likely future feature is tapping an opponent's goal tile to reveal
  their ports. See the "Discard-pile visibility" note in `MASTER_PROJECT_BRIEF.md`
  → "Known Design Questions to Watch". Build the split so ports can flip from
  private to shared without rework.

Nothing in this map depends on the final answer — it just shapes the online data
layout.

---

## Bottom line for the future session

- **Pile A** lifts to the server nearly untouched.
- **Pile B** stays in the browser untouched.
- **Pile C** is the job: ~15 small functions, each split the same way (do the rule,
  let the caller redraw).
- **Two ideas need reshaping, not just splitting:** the King pop-up → a real move,
  and `selected` → a move argument. Plus a one-line shuffle swap.

Nothing here changes how the game plays. It's tidying, done in place.
