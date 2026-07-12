# Salty Schooner

Salty Schooner is a competitive multiplayer Solitaire-style card game with a tropical pirate identity.

## Current status

The project is moving from a single-file browser prototype into a maintainable mobile-first game codebase.

The first product target is an installable phone and iPad prototype that:

- preserves the established game rules,
- supports complete four-round games,
- works well with touch input,
- separates game rules from presentation,
- is ready for authoritative online multiplayer,
- can later be packaged for iOS and Android without rewriting the rules engine.

## Product direction

- **Phone:** portrait-first interface for online multiplayer.
- **iPad:** landscape tabletop mode for local hot-seat play, plus normal single-player-device online play.
- **Initial delivery:** Progressive Web App.
- **Later delivery:** native iOS and Android packaging after the web prototype is stable.

## Repository structure

The repository will be organized around these boundaries:

- `src/game/` — deterministic, framework-independent rules engine
- `src/app/` — application flow and screens
- `src/components/` — reusable interface components
- `src/services/` — persistence, multiplayer, and platform adapters
- `tests/` — rules, integration, and browser tests
- `docs/` — authoritative product and architecture documentation
- `reference/` — preserved historical prototypes

## Development priorities

1. Preserve and test the current rules.
2. Extract a deterministic rules engine from the v11 prototype.
3. Build a complete local playable game.
4. Add responsive phone and iPad interfaces.
5. Integrate proven multiplayer patterns from `NickBlackhall/studio` where appropriate.
6. Apply the full art direction after the game loop is stable.

## Rule changes

Established rules, scoring, card behavior, and game mechanics must not be changed without explicit approval from Nick Blackhall.
