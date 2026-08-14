# Salty Schooner Multiplayer TV Redesign

## Implementation specification

**Target branch:** `multiplayer-prototype`  
**Primary screen:** `/tv`  
**Primary existing file:** `app/tv.html`  
**Purpose:** Redesign the public multiplayer TV display to match the approved command-deck mockup direction without changing game rules.

---

## 1. Outcome

The TV should feel like a cinematic pirate command deck rather than a browser dashboard.

The four Runs and the Brig are the visual center of the screen. Player Holds sit around the edges as compact captain plaques. The layout must work with two through six players, remain readable from across a room, and preserve all existing multiplayer behavior.

The final hierarchy is:

1. Four Runs
2. The Brig
3. Each player's Hold top card and Hold count
4. Current-turn identification
5. Accumulated match score
6. Round number

Do not permanently display the draw-deck count, room code, gameplay instructions, event log, turn number, or a large Salty Schooner logo during active play.

---

## 2. Approved product decisions

### Player colors

- A player chooses a color when joining the room.
- A color may belong to only one player in a room.
- Colors already claimed must appear unavailable on the join screen.
- The server must enforce uniqueness. Client-side disabling alone is not sufficient because two players may select the same color simultaneously.
- If a color is claimed before a join completes, return a friendly message such as: `That color was just taken. Choose another.`
- The chosen color becomes that player's persistent visual identifier for the match.
- Use the color on the player's plaque frame, name accent, and active-turn glow.
- Color must not be the only indication of the active turn. Also use a visible label, brightness change, glow, and/or small scale change.

Use a fixed accessible palette with at least eight choices even though the game supports a maximum of six players. Colors must remain distinguishable against the dark nautical background. Avoid relying on a simple red-versus-green distinction.

### Score

- `SCORE` means the player's accumulated match score up to that point.
- Use the existing public `player.total` value.
- Do not show `roundScore` during active play.
- Round-score additions can continue to appear on the round-results screen.

### Run-card visibility

- Every card remains represented in its Run.
- If a Run contains four cards or fewer, show all cards fully spaced.
- If a Run contains more than four cards, overlap the older history.
- The newest four cards must remain fully visible and fully spaced.
- The final card—the current top card—receives the strongest emphasis, such as a slight lift, scale increase, or glow.
- This behavior applies identically to ascending and descending Runs.
- Kings must continue to display their real rank, declared effective value, and direction indicator.

Example:

```text
Short Run:
[A] [2] [3] [4]

Long Run:
[A][2][3][4][5][6] [7] [8] [9] [10]
 \ overlapping history /  \ newest four fully visible /
```

The overlap is a presentation rule only. Do not truncate, summarize, reorder, or remove cards from state.

---

## 3. Current implementation

The current TV is a read-only public client.

- `app/tv.html` contains the TV markup, inline styles, rendering code, polling setup, realtime wake-up behavior, sound reactions, and Jailbreak splash behavior.
- `netlify/functions/get-public-state.js` returns the public board for a room.
- `netlify/functions/lib/views.js` builds the public view.
- `renderGame(v)` currently renders the header, player seats, Runs, and Brig.
- The TV sends no game actions and holds no player token.
- Sound and Jailbreak presentation are derived by comparing the newest public log entries.

The public player view already exposes:

```js
{
  seat,
  name,
  goalTop,
  goalCount,
  total,
  roundScore
}
```

In the interface, `goalTop` and `goalCount` should be labeled as the player's **Hold** top card and **Hold** count. No Hold-related rules or state names need to change.

The existing public view already supplies everything the redesigned TV needs except the new player color.

---

## 4. Scope

### In scope

- Redesigning the active `/tv` gameplay layout
- Splitting player plaques across the left and right sides
- Supporting two through six players
- Moving the Brig into the center of the four Runs
- Replacing the giant four-column parchment panel with four compact Run lanes
- Overlapping old Run cards while leaving the newest four fully visible
- Adding match score to player plaques
- Adding player-selected, room-unique colors
- Adding color to the public player view
- Simplifying the active-game status line
- Preserving and adapting existing Brig/Jailbreak visual effects
- Responsive verification at common 16:9 television resolutions

### Out of scope

- Any change to card rules
- Any change to legal plays
- Any change to Run completion
- Any change to scoring calculations
- Any change to Hold behavior
- Any change to Jailbreak rules or penalties
- Any change to turn order
- Any change to action payload semantics except carrying a player's selected color during join
- A player-avatar or character-art system
- Displaying private hands or Ports on the TV

---

## 5. Active-game layout

The active game should use three primary columns:

```text
LEFT PLAYER RAIL | CENTRAL COMMAND TABLE | RIGHT PLAYER RAIL
```

The central command table uses two Runs above the Brig and two below it:

```text
             ROUND 2 OF 4

      RUN 1                  RUN 2

                 THE BRIG

      RUN 3                  RUN 4
```

Recommended DOM structure:

```html
<div id="game" class="hidden">
  <header class="tvHeader">
    <div class="tvStatus" id="tvStatus"></div>
  </header>

  <div class="tvStage" id="tvStage">
    <aside class="playerRail" id="seatsLeft"></aside>

    <main class="commandTable">
      <section class="runLane" id="run0"></section>
      <section class="runLane" id="run1"></section>

      <section class="brigWrap">
        <div class="brigBox" id="brigBar">
          <div class="brigInner">
            <div class="cardRow" id="brigCards"></div>
            <div class="brigCaption" id="brigTitle"></div>
          </div>
        </div>
      </section>

      <section class="runLane" id="run2"></section>
      <section class="runLane" id="run3"></section>
    </main>

    <aside class="playerRail" id="seatsRight"></aside>
  </div>
</div>
```

Preserve the IDs `brigBar`, `brigCards`, and `brigTitle`. Existing Jailbreak animation and sound code refers to them.

Recommended grid:

```css
.tvStage {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 14vw minmax(0, 1fr) 14vw;
  gap: 1.2vw;
}

.commandTable {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas:
    "run1 run2"
    "brig brig"
    "run3 run4";
  gap: 1.2vh 1vw;
}

#run0 { grid-area: run1; }
#run1 { grid-area: run2; }
#run2 { grid-area: run3; }
#run3 { grid-area: run4; }
.brigWrap { grid-area: brig; }
```

Exact dimensions should be tuned visually, but the central table must not shrink based on player count. Player plaques should adapt within their rails.

---

## 6. Player-rail behavior

Distribute players by seat order, alternating sides:

```js
const left = [];
const right = [];

v.players.forEach((player, index) => {
  const entry = { player, index };
  (index % 2 === 0 ? left : right).push(entry);
});
```

This produces:

| Players | Left | Right |
|---:|---:|---:|
| 2 | 1 | 1 |
| 3 | 2 | 1 |
| 4 | 2 | 2 |
| 5 | 3 | 2 |
| 6 | 3 | 3 |

Use `justify-content: space-evenly` in each rail so one or two plaques remain balanced rather than stretching vertically.

Each plaque displays:

```text
PLAYER NAME
[HOLD TOP CARD]
HOLD 10
SCORE 12
```

The active player additionally displays `AT THE HELM` or an equivalently clear compact label.

Recommended renderer shape:

```js
function seatHtml({ player: p, index }, currentSeat) {
  const active = p.seat === currentSeat;
  const color = safePlayerColor(p.color);

  return `
    <article
      class="seat ${active ? 'turn' : ''}"
      style="--player-color:${color}"
      data-seat="${p.seat}"
    >
      <div class="nm">${escapeHtml(p.name)}</div>
      <div class="holdCard">${cardHtml(p.goalTop)}</div>
      <div class="holdCount">HOLD ${p.goalCount}</div>
      <div class="score">SCORE ${p.total}</div>
      ${active ? '<div class="helm">AT THE HELM</div>' : ''}
    </article>
  `;
}
```

Do not interpolate arbitrary color strings directly into CSS. Store and validate a palette ID such as `teal`, `coral`, or `violet`, then map it to a trusted CSS color.

The active state should combine:

- Full brightness and saturation
- A colored outer glow
- A slight scale or vertical lift
- A visible `AT THE HELM` label
- Optional brief entrance animation when the current seat changes

Inactive plaques must remain readable. Avoid the current severe dimming treatment.

---

## 7. Player-color implementation

Player-selected color is a multiplayer identity feature, so it must be stored authoritatively.

### Suggested representation

Store a palette ID, not a raw CSS value:

```text
teal
coral
gold
violet
blue
lime
pink
orange
```

The exact palette can be adjusted during visual implementation.

### Required behavior

1. After entering a valid room code, `/join` displays available colors.
2. Colors already used by players in that room are disabled.
3. The player selects a name and an available color.
4. The join request includes the selected palette ID.
5. The server validates that the ID belongs to the supported palette.
6. The server atomically rejects a duplicate color in the same room.
7. The public player view includes the selected color.
8. `/tv` maps the palette ID to a trusted visual value.

### Uniqueness

Enforce uniqueness at the database layer where practical, for example with a unique constraint covering the room and color fields:

```text
UNIQUE (room_id, player_color)
```

The join endpoint should translate a uniqueness conflict into a friendly application error rather than exposing a database message.

### Reconnection

A reconnecting player must retain their original color. Reconnection must not be treated as a new claim if it is restoring the same player record.

### Host and lobby

Show the chosen color on lobby player chips so players can confirm their identity before the match begins.

---

## 8. Player-color styling

The color should accent the existing nautical materials rather than replace them.

Recommended use:

```css
.seat {
  --player-color: #36c5b3;
  background:
    linear-gradient(rgba(38, 18, 52, .86), rgba(38, 18, 52, .9)),
    url("/assets/tex-purple.webp") center / 300px;
  box-shadow:
    inset 0 0 0 .25vh color-mix(in srgb, var(--player-color) 65%, #fff 15%),
    0 .5vh 2vh rgba(0, 0, 0, .55);
}

.seat .nm {
  color: color-mix(in srgb, var(--player-color) 45%, #fff);
}

.seat.turn {
  filter: none;
  transform: scale(1.035);
  box-shadow:
    0 0 2vh color-mix(in srgb, var(--player-color) 80%, transparent),
    0 .7vh 2.2vh rgba(0, 0, 0, .65);
}
```

If browser support for `color-mix()` is a concern, define a complete trusted set of CSS custom properties for each palette class instead.

---

## 9. Run rendering

Each Run is a compact parchment or painted-wood lane placed directly on the dark command table. Do not put all four Runs inside one giant cream rectangle.

Each lane displays:

- Run number
- Direction badge when established
- Full card sequence, with compressed history when necessary
- Quiet empty state

Recommended renderer:

```js
function runHtml(run, index) {
  const cards = run.cards || [];
  const visibleTail = 4;
  const historyCount = Math.max(0, cards.length - visibleTail);
  const direction = run.direction === 'up'
    ? '<span class="dirBadge up">↑ UP</span>'
    : run.direction === 'down'
      ? '<span class="dirBadge down">↓ DOWN</span>'
      : '';

  const cardsHtml = cards.length
    ? cards.map((card, cardIndex) => {
        const inHistory = cardIndex < historyCount;
        const top = cardIndex === cards.length - 1;
        return `
          <span
            class="runCard ${inHistory ? 'history' : 'visibleTail'} ${top ? 'top' : ''}"
            style="--card-index:${cardIndex}"
          >${cardHtml(card)}</span>
        `;
      }).join('')
    : '<div class="emptyRun">EMPTY · A OR Q</div>';

  return `
    <div class="runHeader">
      <span>RUN ${index + 1}</span>
      ${direction}
    </div>
    <div class="runCards" style="--history-count:${historyCount}">
      ${cardsHtml}
    </div>
  `;
}
```

Recommended layout behavior:

```css
.runCards {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: visible;
}

.runCard {
  position: relative;
  flex: 0 0 auto;
  z-index: var(--card-index);
}

.runCard.history + .runCard.history,
.runCard.history + .runCard.visibleTail {
  margin-left: -3.5vh;
}

.runCard.visibleTail + .runCard.visibleTail {
  margin-left: .6vh;
}

.runCard.top {
  transform: translateY(-.35vh) scale(1.08);
  filter: drop-shadow(0 .5vh .7vh rgba(0, 0, 0, .55));
}
```

The exact overlap should be tuned so the rank/suit corner or central rank of old cards remains recognizable. The newest four cards must never overlap each other.

If the entire sequence still exceeds the lane at an extreme length, reduce the history step progressively. Do not shrink the newest four below the normal TV card size.

---

## 10. Empty Runs

An empty Run keeps its grid position but becomes visually quiet:

```text
RUN 2
EMPTY · A OR Q
```

Use reduced parchment opacity, a thin frame, and no large blank cream field. The lane should visually “come alive” as cards are added.

---

## 11. The Brig

The Brig is centered between the two pairs of Runs and remains visible in every active-game state.

### Empty

- Dark, quiet cage
- Caption: `THE BRIG IS EMPTY`
- Minimal glow

### Occupied

- Show all waiting Kings using the existing Brig card renderer
- Caption: `1 KING IN THE BRIG` or `3 KINGS IN THE BRIG`
- Warm lantern or ember glow
- Stronger frame presence than the empty state

### Active Jailbreak

- Preserve the existing buildup shake, sound, and fullscreen splash
- Brig frame glows and rattles before the splash
- Released Kings and count continue to come from the existing public Brig view
- Do not change Jailbreak detection, rules, or outcomes

The existing event logic uses public log differences. Continue fetching `v.log` even though it remains hidden from the TV.

---

## 12. Header and permanent HUD

During active play, reduce the permanent header to:

```text
ROUND 2 OF 4
```

The current-player plaque already communicates whose turn it is. Optionally show a brief, self-dismissing banner after a turn change:

```text
NICK TAKES THE HELM
```

Remove from the permanent active-game display:

- Deck count
- Room code
- Turn number
- Help text
- Event log
- Large logo

The room code and logo remain appropriate in the entry and lobby screens. The logo may also appear during results or major transitions.

---

## 13. Render-code organization

Refactor `renderGame(v)` into small presentation helpers while preserving its inputs:

```js
function renderGame(v) {
  show('game');
  renderTvHeader(v);
  renderPlayerRails(v);
  renderRuns(v.runs);
  renderBrig(v.brig);
}
```

Suggested helpers:

- `renderTvHeader(v)`
- `renderPlayerRails(v)`
- `seatHtml(entry, currentSeat)`
- `renderRuns(runs)`
- `runHtml(run, index)`
- Existing `renderBrig` logic, or a new helper preserving the same element IDs
- Existing `cardHtml(c)`
- `escapeHtml(value)` for player-controlled names
- `safePlayerColor(colorId)` or palette-class mapping

Do not mutate the public view while rendering it.

---

## 14. Behavior that must remain unchanged

The redesign must preserve:

- Room-code entry and restoration
- Lobby rendering
- Public-state polling
- Realtime doorbell wake-ups
- Idle and hard-stop behavior
- Mute behavior
- Card face rendering
- King effective-value badge
- Run direction meaning
- Brig state meaning
- Jailbreak buildup, trigger, success, and failure sounds
- Fullscreen Jailbreak moment
- Round-results rendering
- Game-results rendering
- Sorting the final results by existing scoring rules
- The TV's read-only and token-free security model

Do not widen `get-public-state` to include private player hands or Ports.

---

## 15. Responsive requirements

The TV target is 16:9. Verify at minimum:

- 1280 × 720
- 1920 × 1080
- 3840 × 2160

Use viewport-relative sizing without reintroducing small pixel ceilings that make the interface tiny on 4K televisions.

The design must support:

- Two through six players
- Three plaques per rail without overflow
- Long player names without changing plaque dimensions
- Four populated Runs simultaneously
- Long Runs with overlapped history
- Multiple Kings in the Brig
- The mute button without covering player information

Prefer truncating an exceptionally long player name with an ellipsis over shrinking all plaque text.

---

## 16. Test matrix

Capture or visually inspect each of these states:

### Player counts

- 2 players: 1 left, 1 right
- 3 players: 2 left, 1 right
- 4 players: 2 left, 2 right
- 5 players: 3 left, 2 right
- 6 players: 3 left, 3 right

### Player states

- Each rail position active in turn
- All palette colors represented
- Long player names
- Score values of 0, two digits, and three digits
- Hold empty or cleared where applicable
- Hold counts of one and two digits

### Run states

- Empty Run
- One through four cards: all fully spaced
- Five cards: one historical card and newest four fully spaced
- Long ascending Run
- Long descending Run
- King in the compressed history
- King among the newest four
- King as the top card

### Brig states

- Empty
- One waiting King
- Several waiting Kings
- Active Jailbreak
- Jailbreak success
- Jailbreak failure

### Application states

- Code entry
- Lobby
- Active round
- Round results
- Game results
- Refresh and room restoration
- Idle pause and resume

---

## 17. Acceptance criteria

The implementation is complete when:

1. The four Runs surround a central Brig in a two-above/two-below composition.
2. The giant four-column parchment panel is gone.
3. Two through six player plaques fit without overflow.
4. Players are split across both sides of the command table.
5. Every plaque shows name, Hold top card, Hold count, and accumulated match score.
6. Each player has a room-unique, player-selected color.
7. The active player is obvious without relying on color alone.
8. Runs of four cards or fewer show every card fully spaced.
9. Longer Runs overlap older cards while the newest four remain fully visible.
10. The top Run card receives clear visual emphasis.
11. Empty Runs are compact and visually quiet.
12. Deck count, room code, instructions, log, and large logo are absent during active play.
13. Existing Brig and Jailbreak presentation still works.
14. Existing polling, realtime, idle, lobby, results, and sound behavior still works.
15. No card, scoring, Hold, turn, Run, or Jailbreak rules have changed.
16. The layout is readable and uncropped at 720p, 1080p, and 4K.

---

## 18. Recommended implementation order

1. Add authoritative player-color storage and validation.
2. Add color selection and unavailable-color states to `/join`.
3. Add the trusted color ID to lobby and public player views.
4. Replace the active TV body with left rail, command table, and right rail.
5. Implement two-through-six-player rail distribution.
6. Add Hold labels and match score to plaques.
7. Implement four independent Run lanes.
8. Implement the four-visible-card tail and overlapping history.
9. Move and restyle the Brig while preserving its element IDs.
10. Simplify the active-game header.
11. Reconnect existing Jailbreak effects and confirm audio timing.
12. Run the full visual and behavioral test matrix.

---

## 19. Guiding principle

The redesigned TV is a public theatrical display, not a control surface. It should make the current board state and major game moments legible from across a room while leaving all decisions and controls on player and host devices.

**Final concept:** A cinematic pirate command deck where four card Runs surround a dangerous central Brig, and color-coded captain plaques line the edges like rival crews watching the board unfold.
