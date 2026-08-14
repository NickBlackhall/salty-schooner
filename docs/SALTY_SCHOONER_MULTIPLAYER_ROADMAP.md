# Salty Schooner — Jackbox-Style Multiplayer Roadmap

**Project baseline:** v26.16  
**Deployment target:** Netlify-hosted browser game  
**Game format:** Shared TV/host screen + one private phone controller per player  
**Status:** Planning / pre-refactor  
**Last updated:** 2026-07-22

> v26.16 is the current source of truth. Older v11 briefs and prototypes are historical references only. Do not restore older rules accidentally during the multiplayer refactor.

---

## 1. Goal

Build a couch-party version of **Salty Schooner** that works like a Jackbox game:

1. One player opens the host page on a laptop, iPad, or TV-connected device.
2. The host page creates a room and displays a room code and QR code.
3. Players join from their phones without installing an app.
4. The TV shows only public game information.
5. Each phone shows that player's private cards and legal controls.
6. A server acts as the dealer, referee, and official source of truth.

This remains true multiplayer. The phones are private controllers, while the shared screen presents the public table.

---

## 2. Current technical direction

### Prototype deployment

The first playable multiplayer prototype can remain in a single GitHub repository and deploy through Netlify.

Recommended first deployment:

- **Netlify site:** Host screen and phone-controller pages.
- **Netlify Functions:** Room creation, joining, action submission, rule validation, and state updates.
- **Database:** Store active rooms, players, resume tokens, and current game state.
- **Updates:** Poll for state changes roughly every 500–1,000 milliseconds.

Schooner is turn-based, so polling is acceptable for the first couch prototype.

### Later real-time upgrade

If polling feels sluggish, keep the host and phone pages on Netlify and move only the live game server to a persistent real-time service using WebSockets or Socket.IO.

Possible later options:

- Railway
- Render
- Fly.io
- Cloudflare Durable Objects
- PlayFab Multiplayer Servers

PlayFab is valid but is not recommended for the first prototype. It adds container deployment, server allocation, secure browser WebSocket work, and account configuration before the basic format has been tested.

---

## 3. Architecture in plain English

```text
                       Netlify website
                    /                    \
           Shared host page          Player phone pages
                    \                    /
                 Server-side game referee
                           |
                    Official room state
```

### Shared host screen

The TV or laptop displays public information only:

- Shared Runs
- The Brig
- Player names
- Scores
- Current player and phase
- Public pile counts and visible cards
- Draw-deck count
- Round status
- Public animations, sound, announcements, and results

### Private phone controller

Each phone displays only information belonging to that player:

- Private hand
- Current playable Hold/goal card, as permitted by v26.16
- Personal Ports/discard piles
- Legal card destinations
- King declaration choices
- Jailbreak choices
- Draw and discard controls
- Waiting, connection, and turn status

### Authoritative server

The server must be the only referee. Phones submit requested actions; they never directly rewrite the game state.

For each action, the server must:

1. Identify the room and player.
2. Confirm that the player is allowed to act.
3. Confirm that the action applies to the current state version.
4. Validate the action using the rules engine.
5. Apply it once.
6. Save the new room state.
7. Send a public view to the host.
8. Send a different private view to each player.

Private hands must not be sent to the host or other phones and merely hidden with CSS.

---

## 4. Immediate owner checklist

Complete these before adding networking.

- [ ] Confirm the exact v26.16 source is committed to GitHub.
- [ ] Tag or release the current source as `v26.16-hotseat-baseline`.
- [ ] Create a branch named `multiplayer-prototype`.
- [ ] Keep the current hot-seat version working on the main branch.
- [ ] Add this roadmap at `docs/SALTY_SCHOONER_MULTIPLAYER_ROADMAP.md`.
- [ ] Create a current rules document at `docs/RULES_v26.16.md`.
- [ ] Document every deliberate rule difference from the old v11 build.
- [ ] Save several exported v26.16 game states for testing and regression checks.

The existing older project brief still names v11 as the stable version and therefore must not be treated as the current rules authority. The current roadmap supersedes its implementation sequence while retaining its useful architectural principle: separate game state, rules, actions, and UI before networking. 

---

## 5. Phase 0 — Freeze and document v26.16

### Objective

Create a reliable baseline so multiplayer work does not silently alter established gameplay.

### Required work

- [ ] Save the exact deployed v26.16 source.
- [ ] Record the current version number visibly in the application and repository.
- [ ] Write the complete current rules in Markdown.
- [ ] Record supported player count.
- [ ] Record setup options such as Hold size and round count.
- [ ] Record current hand refill behavior.
- [ ] Record current King and Jailbreak behavior.
- [ ] Record failed-Jailbreak consequences.
- [ ] Record round scoring and final scoring.
- [ ] Record deck exhaustion behavior.
- [ ] Export representative game states.

### Required test states

Save examples containing:

- [ ] A normal upward Run.
- [ ] A normal downward Run.
- [ ] An unset opening Run.
- [ ] A legal King declaration.
- [ ] Multiple Kings in The Brig.
- [ ] A successful Jailbreak.
- [ ] A failed Jailbreak.
- [ ] An empty hand awaiting the current v26.16 refill decision.
- [ ] A nearly completed Hold/goal pile.
- [ ] A round-ending move.

### Definition of done

A developer can read `RULES_v26.16.md`, open the saved build, import the test states, and understand exactly what behavior must be preserved.

---

## 6. Phase 1 — Extract the rules engine

### Objective

Separate gameplay rules from the existing screen without adding networking or redesigning the game.

### Core rule

The UI must stop changing game state directly. Every change must pass through a named game action handled by a reusable rules engine.

### Recommended structure

```text
src/
|-- game/
|   |-- state.ts
|   |-- actions.ts
|   |-- reducer.ts
|   |-- legal-actions.ts
|   |-- scoring.ts
|   |-- views.ts
|   `-- validation.ts
|
|-- ui/
|   `-- current-hotseat-interface/
|
`-- tests/
```

### Conceptual engine interface

```ts
applyAction(gameState, action) => {
  state: nextGameState,
  events: gameEvents
}
```

Supporting functions:

```ts
getLegalActions(state, playerId)
getHostView(state)
getPlayerView(state, playerId)
validateState(state)
```

### Initial action list

Final names must match the actual v26.16 rules, but the action model will likely include:

```text
START_GAME
START_ROUND
DRAW_OR_REFILL_HAND
PLAY_CARD_TO_RUN
DECLARE_KING
PLACE_JAILBREAK_KING
COMPLETE_JAILBREAK
FAIL_JAILBREAK
DISCARD_TO_PORT
END_TURN
END_ROUND
ADVANCE_ROUND
```

### Requirements

- [ ] Preserve the current hot-seat interface as a test harness.
- [ ] Move canonical state into a dedicated module.
- [ ] Move rule validation into the engine.
- [ ] Move state mutations into the engine.
- [ ] Represent user choices as named actions.
- [ ] Make the UI render from returned state.
- [ ] Add deterministic seeded shuffling for reproducible tests.
- [ ] Add a state version number.
- [ ] Add stable card IDs.
- [ ] Keep all current v26.16 rules unchanged.

### Definition of done

The hot-seat game still plays correctly, but the interface no longer owns or directly mutates the rules.

---

## 7. Phase 2 — Automated rules tests

### Objective

Prove that extracting the engine did not change the game.

### Minimum tests

- [ ] Natural card played upward.
- [ ] Natural card played downward.
- [ ] Empty Run starts with Ace.
- [ ] Empty Run starts with Queen.
- [ ] Opening Run may begin with a middle card.
- [ ] Direction becomes established correctly.
- [ ] Legal King declaration.
- [ ] Illegal King declaration.
- [ ] King cannot perform any prohibited v26.16 action.
- [ ] Successful Jailbreak.
- [ ] Failed Jailbreak restoration.
- [ ] Failed-Jailbreak penalty matches v26.16.
- [ ] Current v26.16 hand refill behavior.
- [ ] Mandatory end-turn discard behavior.
- [ ] Hold/goal clearing ends the round.
- [ ] Round scoring.
- [ ] Final-game scoring.
- [ ] Deck exhaustion.
- [ ] Duplicate action does not execute twice.
- [ ] Two conflicting actions cannot both succeed.
- [ ] Host view contains no private hands.
- [ ] Player A view contains no Player B hand.

### Definition of done

The engine can be changed safely because the important rules are protected by automated tests.

---

## 8. Phase 3 — Build the smallest multiplayer room

### Objective

Prove the networking model before building the complete game interface.

### First multiplayer milestone

Only implement enough to prove:

1. The host creates a room.
2. The host receives a room code.
3. Two phones join.
4. Each phone receives a different private hand.
5. The host receives public state only.
6. One player submits a normal legal card play.
7. The server validates and applies it.
8. The host updates.
9. The player discards.
10. The turn changes.

Do not begin with every King and Jailbreak edge case over the network.

### Required room data

```text
roomId
roomCode
hostResumeToken
status
stateVersion
currentGameState
players[]
createdAt
lastActivityAt
```

### Required player data

```text
playerId
playerName
seatNumber
resumeToken
connectionStatus
lastSeenAt
```

### Required protections

- [ ] Room codes checked for collision.
- [ ] Room codes checked against a blocked-word list.
- [ ] Player seats protected by resume tokens.
- [ ] Actions include unique action IDs.
- [ ] Actions include the expected state version.
- [ ] Stale actions are rejected.
- [ ] Duplicate actions are ignored safely.
- [ ] Inactive rooms expire automatically.

### Definition of done

Two real phones can play one normal networked turn while the host displays only public information.

---

## 9. Phase 4 — Netlify prototype deployment

### Objective

Deploy the first couch-play version through the existing GitHub-to-Netlify workflow.

### Suggested routes

```text
/                 Landing page
/host             Create and display a game room
/join             Enter a room code
/join/:roomCode   Join a specific room
/play/:roomCode   Player controller
```

### Suggested server functions

```text
/.netlify/functions/create-room
/.netlify/functions/join-room
/.netlify/functions/resume-room
/.netlify/functions/get-host-view
/.netlify/functions/get-player-view
/.netlify/functions/submit-action
/.netlify/functions/leave-room
/.netlify/functions/close-room
```

### Prototype update loop

- Host polls for its public view approximately every 500–1,000 ms.
- Each phone polls for its private view approximately every 500–1,000 ms.
- After submitting an action, the acting phone requests an immediate fresh view.
- Polling slows when the browser tab is hidden.
- A full fresh view is requested after reconnecting or returning to the tab.

### Definition of done

The game can be opened from a normal Netlify URL, hosted on a TV-connected device, and joined from phones using a room code or QR code.

---

## 10. Phase 5 — Complete the multiplayer rules

### Objective

Move the remaining v26.16 interactions through the authoritative room server.

### Features

- [ ] All legal Run plays.
- [ ] King declarations.
- [ ] Jailbreak initiation.
- [ ] Multi-King Jailbreak placement.
- [ ] Failed Jailbreak behavior.
- [ ] Hand refill choice or behavior from v26.16.
- [ ] Port/discard management.
- [ ] Round ending.
- [ ] Score calculation.
- [ ] Next-round setup.
- [ ] Final-game results.
- [ ] Two through six players, after two-player stability is proven.

### Required game phases

Use an explicit state machine rather than relying on whichever dialog is visible.

```text
LOBBY
ROUND_SETUP
TURN_PLAY
KING_DECLARATION
JAILBREAK_PLACEMENT
TURN_DISCARD
ROUND_RESULTS
GAME_RESULTS
```

Only actions valid for the current phase should be accepted.

### Definition of done

A complete game can be played from beginning to final score using one host screen and private phones.

---

## 11. Phase 6 — Reconnection and resilience

### Objective

Make normal phone and browser interruptions survivable.

### Requirements

- [ ] Player ID stored locally on the phone.
- [ ] Secret resume token stored locally.
- [ ] Room code stored locally.
- [ ] Host has its own resume token.
- [ ] Phone refresh restores the correct seat.
- [ ] Host refresh restores the room.
- [ ] Returning from a locked phone requests a full current view.
- [ ] Temporary disconnect does not remove the player immediately.
- [ ] Server restart behavior is documented.
- [ ] Active game can be exported for debugging.
- [ ] Action log can be exported.

### Definition of done

A phone or host browser can refresh without destroying the active game or revealing another player's private cards.

---

## 12. Phase 7 — Couch-play interface

### Objective

Replace the hot-seat table layout with a true shared-screen presentation and private controller experience.

### Host-screen priorities

- Large readable cards and Runs.
- Obvious active-player indicator.
- Clear current phase.
- Strong King and Jailbreak presentation.
- Public pile counts.
- Round and score display.
- QR code and room code in the lobby.
- Clear disconnected-player warning.
- Minimal need to touch the host device after starting.

### Phone priorities

- Large touch targets.
- Tap card, then tap destination.
- No required drag-and-drop.
- Compact Run summaries.
- Clear legal-action highlighting.
- Clear waiting state.
- Clear error messages when an action is rejected.
- Minimal decorative clutter behind cards.

### Audio

Use the host screen as the main synchronized audio source. Do not play full music and voice-over separately on every phone.

### Definition of done

Players can understand whose turn it is, what they can do, and what happened without crowding around one device.

---

## 13. Phase 8 — Playtesting and pacing

### Objective

Verify that Schooner works as a party game, not merely that networking works.

### Measure

- Average turn length.
- Longest turn.
- Number of cards played per turn.
- Time spent making King choices.
- Time spent resolving Jailbreaks.
- Number of rejected or mistaken actions.
- Number of reconnections.
- Number of rule explanations required.
- Whether waiting players remain engaged.
- Whether TV animations improve or slow the game.

### Watch especially

Schooner allows long productive turns. The largest party-game risk may be downtime for everyone else.

Before changing rules, allow waiting players to:

- Review their own hand.
- Review their own Ports.
- Review public Run summaries.
- Plan their likely next turn.

Do not add timers or new pace rules until couch testing proves they are needed.

### Definition of done

At least one complete couch session finishes successfully and produces actionable pacing notes.

---

## 14. Phase 9 — Real-time server upgrade, only if needed

### Trigger

Upgrade away from polling only when testing shows that:

- Updates feel noticeably delayed.
- Polling causes excessive cost or traffic.
- Simultaneous room count grows.
- Reconnection remains unreliable.
- The project requires instant events.

### Upgrade path

Keep the Netlify-hosted interfaces and replace the polling backend with a persistent real-time service.

```text
Netlify host and phone pages
              |
      WebSocket / Socket.IO
              |
 Persistent game-room server
```

The rules engine, action protocol, host views, player views, room codes, and controller UI should remain reusable.

### PlayFab decision point

Evaluate PlayFab Multiplayer Servers when the project needs several of the following:

- Many simultaneous public rooms.
- Automatic regional server allocation.
- Matchmaking.
- Production-scale monitoring.
- Player identity and progression.
- Stronger protection against hostile public clients.
- Commercial launch infrastructure.

Do not adopt PlayFab merely because the early usage may fit within a free allowance.

---

## 15. Recommended repository layout

Do not reorganize everything immediately if v26.16 currently uses a simpler structure. Move toward this gradually.

```text
salty-schooner/
|
|-- apps/
|   |-- host/
|   |-- controller/
|   `-- server/
|
|-- packages/
|   |-- game-core/
|   `-- protocol/
|
|-- docs/
|   |-- RULES_v26.16.md
|   |-- SALTY_SCHOONER_MULTIPLAYER_ROADMAP.md
|   `-- architecture/
|
|-- tests/
|   |-- fixtures/
|   |-- rules/
|   |-- privacy/
|   `-- reconnect/
|
`-- archive/
    `-- v26.16-hotseat-baseline/
```

---

## 16. First GitHub issue

Copy this into the repository as the first implementation issue.

```markdown
# Prepare Salty Schooner v26.16 for multiplayer

## Goal

Refactor the current v26.16 game so its rules can run independently from the existing hot-seat interface.

Do not add networking yet.
Do not alter established game rules.
Do not redesign the interface.

## Required work

1. Preserve the existing hot-seat game as a working test interface.
2. Move canonical game state into a separate module.
3. Move rule validation and state changes into a reusable game-engine module.
4. Convert interface interactions into named game actions.
5. Make the interface render from the engine's returned state.
6. Add automated tests for the most important v26.16 rules.
7. Add player-specific and host-specific view builders.
8. Confirm that host views and other-player views never contain private hands.

## Initial action types

- START_GAME
- START_ROUND
- DRAW_OR_REFILL_HAND
- PLAY_CARD_TO_RUN
- DECLARE_KING
- PLACE_JAILBREAK_KING
- COMPLETE_JAILBREAK
- FAIL_JAILBREAK
- DISCARD_TO_PORT
- END_TURN
- END_ROUND
- ADVANCE_ROUND

Adjust names only where needed to match the documented v26.16 rules.

## Required tests

- Natural card played upward
- Natural card played downward
- Empty Run starts with Ace
- Empty Run starts with Queen
- Opening middle card and direction establishment
- Legal King declaration
- Illegal King declaration
- Successful Jailbreak
- Failed Jailbreak restoration and penalty
- Current v26.16 hand refill behavior
- Mandatory end-turn discard behavior
- Hold clearing ends the round
- Round scoring
- Final-game scoring
- Deck exhaustion
- Duplicate action rejection
- Private hand isolation

## Definition of done

The existing hot-seat interface still plays correctly, but it no longer changes game state directly. All game changes pass through the extracted rules engine.
```

---

## 17. First playable multiplayer definition

The first meaningful multiplayer prototype is complete when:

- [ ] The host creates a room.
- [ ] A QR code and room code are shown.
- [ ] Two players join from separate phones.
- [ ] Each phone receives a different private hand.
- [ ] The host never receives private hand data.
- [ ] Only the current player can act.
- [ ] Normal card plays are server validated.
- [ ] Duplicate taps cannot duplicate moves.
- [ ] Stale actions are rejected cleanly.
- [ ] The player can discard and end the turn.
- [ ] The next player's phone becomes active.
- [ ] A phone can refresh and reclaim its seat.
- [ ] The host can refresh and recover the room.
- [ ] A complete round can finish.
- [ ] A complete game can eventually finish with correct scoring.
- [ ] Game state and action logs can be exported for debugging.

---

## 18. Explicitly out of scope for the first prototype

Do not spend development time on these until the basic couch format works:

- PlayFab deployment.
- Matchmaking.
- Public player accounts.
- Profiles or progression.
- Steam packaging.
- Console packaging.
- Native phone applications.
- Spectator or audience mode.
- Voice acting.
- Elaborate transitions.
- Monetization.
- New game mechanics.
- A full art redesign.
- Large-scale infrastructure.

---

## 19. Decision log

### Confirmed decisions

- v26.16 is the multiplayer baseline.
- Older v11 documents are historical.
- The desired format is Jackbox-style couch play.
- The host screen is public.
- Phones contain private player information and controls.
- The server is authoritative.
- The first prototype can deploy through Netlify.
- Netlify polling is acceptable for the first turn-based prototype.
- A persistent real-time server is a later upgrade if testing justifies it.
- PlayFab remains a future option, not the immediate starting point.
- The first coding task is rules-engine extraction, not networking or visual redesign.

### Decisions still open

- Exact v26.16 canonical rules document.
- Exact database choice for active Netlify rooms.
- React versus plain TypeScript for new interfaces.
- Four-character versus five-character room codes.
- Maximum supported player count for the first networked test.
- Whether the first deployment preserves the current landing screen or introduces a new Host/Join menu.

---

## 20. Next action

The next action in VS Code is:

1. Add this roadmap to `docs/`.
2. Confirm and tag the v26.16 baseline.
3. Create `docs/RULES_v26.16.md` from the actual current build.
4. Create the `multiplayer-prototype` branch.
5. Open the first GitHub issue from Section 16.
6. Begin Phase 1: extract the rules engine without changing gameplay.

Do not begin with PlayFab, WebSockets, QR codes, or the TV redesign. The multiplayer work becomes manageable only after the rules engine is separated from the current UI.
