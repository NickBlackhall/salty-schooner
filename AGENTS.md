# AGENTS.md

## Project mission

Build Salty Schooner into a stable, mobile-first card game prototype for phones and iPads while preserving the established rules exactly.

## Authority order

When sources conflict, use this order:

1. `docs/MASTER_PROJECT_BRIEF.md`
2. Newer written decisions approved by Nick Blackhall
3. The newest stable prototype in `reference/`
4. Existing implementation details

Do not infer a new rule from artwork, layout mockups, or promotional images.

## Non-negotiable rule safety

Do not change any of the following without explicit approval from Nick Blackhall:

- game rules,
- scoring,
- card values or sequencing,
- King behavior,
- Jailbreak behavior,
- round setup,
- turn structure,
- win conditions,
- number of rounds,
- penalties,
- visibility rules for multiplayer.

When implementation behavior and written rules disagree, preserve the written rule and document the discrepancy.

## Architecture requirements

- Keep the rules engine framework-independent.
- Represent state as serializable data.
- Route all state changes through validated actions.
- Make random behavior injectable and seedable for tests.
- Keep rendering, animation, networking, storage, and sound outside the rules engine.
- Design multiplayer around an authoritative host or server.
- Produce player-specific views so private hands are never leaked.
- Prefer explicit state transitions over UI-driven mutation.
- Preserve enough event history to debug a failed game state.

## Product targets

### Phone

- Portrait-first online multiplayer layout.
- Touch-first controls.
- No hover-only interactions.
- Respect notches and safe areas.

### iPad

- Landscape hot-seat tabletop layout.
- Player 2 may be rotated 180 degrees in tabletop mode.
- Also support a conventional landscape online layout.

### Delivery

- Build as an installable PWA first.
- Keep the codebase suitable for later iOS and Android packaging.
- Do not introduce native-only dependencies into the rules engine.

## Development workflow

- Work in focused branches and pull requests.
- Keep commits scoped and descriptive.
- Add or update tests for every rules-engine change.
- Run type checking, unit tests, and the production build before declaring work complete.
- Use deterministic test fixtures for edge cases.
- Preserve exported failing states when debugging.
- Distinguish rules bugs, UI bugs, networking bugs, and data bugs in issue and PR descriptions.

## Testing priorities

At minimum, cover:

- round setup and deck composition,
- opening Run 1 behavior,
- upward and downward sequencing,
- legal and illegal King values,
- King direction declarations,
- normal King-on-King rejection,
- successful Jailbreaks across multiple runs,
- the single allowed Jailbreak King-on-Key-King exception,
- failed Jailbreak rollback,
- Curse of the Crown penalty placement,
- hand refill after playing through all five cards,
- legal turn-ending discard,
- round completion,
- scoring,
- four-round game completion,
- private and public multiplayer views,
- reconnect-safe serialized state.

## UI and art direction

- Gameplay clarity takes priority over decorative art.
- Promotional art may be loud; gameplay surfaces must stay readable.
- Use the tropical pirate, comic-energy visual direction in `docs/ART_DIRECTION.md`.
- Treat concept images as visual references, not mechanically accurate layouts.
- Keep major art assets replaceable while prototyping.

## Reuse from Make It Terrible

The `NickBlackhall/studio` repository may be studied for proven patterns involving:

- room creation and joining,
- room codes,
- Supabase real-time subscriptions,
- authoritative server actions,
- transition-state coordination,
- host departure and room cleanup,
- reconnect and navigation handling,
- multiplayer browser tests,
- PWA and Netlify configuration.

Reuse patterns selectively. Do not copy unrelated game logic, branding, content, or accumulated technical debt.

## Autonomy

Agents may make normal architecture, testing, accessibility, responsive-layout, deployment, and implementation decisions without asking for approval.

Stop and ask before:

- changing a rule or mechanic,
- adding a new gameplay mechanic,
- removing an established mode,
- making a major scope change,
- adopting a paid service,
- exposing private player information,
- replacing the authoritative multiplayer model.
