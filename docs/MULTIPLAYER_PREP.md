# Getting Salty Schooner Ready for Online Multiplayer

Plain-English prep notes. Nothing here changes the rules or how the game plays —
it's about quietly reshaping the code now so a future online version is a lift,
not a rewrite. Written 2026-07-20.

## The situation

Right now the whole game lives in one file (`app/index.html`) that does everything
at once: the game's **rules** and the game's **looks** (cards, sounds, animations,
pop-ups) are mixed together. Perfect for one device where players pass the phone
around. But online multiplayer needs the rules to live on a central server that all
players connect to — and today the rules can't be pulled out cleanly because
they're tangled up with the visual stuff.

## The good news

We don't rewrite the game. The rules already exist and work. They just need to be
**separated** from the visual stuff — like pulling the engine out of a car to drop
it into a different car later. That "engine" (the pure rules) is the exact thing
that will eventually run on the server. Because the ruleset is basically settled,
now is the right time to do this.

## What to do (plain terms, in order of value)

1. **Separate the rules from the looks.** Get all the "what's a legal move / who
   won / what happens next" logic into its own tidy box that doesn't touch sounds,
   animations, or the screen. This is ~80% of the value; everything else gets easy
   after it. *(Start here.)*

2. **Fix the pop-up problem.** When a King is played, the game pops up a "which
   direction?" box and waits for an answer. That works on one phone, but online it
   breaks — another player's phone can't answer your pop-up. That decision needs to
   become a normal *move* a player makes, not a pop-up. This is the one spot that
   genuinely doesn't survive going online, so handle it early.

3. **Send every move through one doorway.** Funnel every move through a single point
   in the code instead of many scattered bits. Later, that single point becomes the
   server code almost unchanged.

4. **Make the card shuffle repeatable.** A small change so the shuffle can be
   re-created exactly. The server needs this so players can't cheat or peek at the
   deck.

5. **Decide what's secret vs. shared.** Your hand and goal pile are secret to you;
   the board, scores, and whose-turn are shared. Writing down which is which now
   makes the online version much safer later.

6. **Add quick automated tests for the rare edge cases** (jailbreak failures,
   stalls, etc.) — but only *after* step 1, since the tidy rules box is what makes
   testing without a browser possible. Locks the settled ruleset down.

## Why it's worth it

Do this and the current game still plays exactly the same — but you've quietly built
the "engine" the online version needs. When you're ready to go online, you drop that
engine onto a server and reuse the ready-made **rooms, room codes, and live-syncing**
parts from the other game (`github.com/NickBlackhall/studio`). Far less work than
starting fresh.

## Start with

Item **#1** — separate rules from looks. It's the foundation; a structural cleanup
with no rule changes, so the game should feel identical afterward. A function-by-
function checklist for exactly this is in `docs/RULES_VS_LOOKS_MAP.md`.

---

## Technical appendix (for a future coding session)

The online target, sketched:

- **Stack:** Next.js + Supabase (Postgres + Realtime), same as `studio`.
- **Reusable ~30% from `studio` (game-agnostic):** Supabase client setup, room-code
  system, the "subscribe to changes → refetch the true state" pattern, login/roles,
  and room cleanup/teardown. Rewrite the game rules; reuse the plumbing.
- **The pure rules engine** from step 1 is the same artifact in three places: it
  checks moves in today's single-file game, it becomes the body of every server
  action online, and it's what the automated tests exercise. Build once.
- **Schema (rough):** a `games` table (public board state, whose turn, room code,
  seed), a `players` table (one row per seat, with **hand/goal kept private via
  row-level security** so nobody can read another player's cards), and optionally a
  `game_events` log (doubles as the live-sync signal and the game-records export).
- **Server actions (rough):** lobby/lifecycle (`createRoom`, `joinRoomByCode`,
  `toggleReady`, `startGame`, `endGameEarly`/clinch, `returnToLobby`, `resetRoom`)
  and gameplay (`playCardToRun`, `declareKing` ← the ex-pop-up, `discardCard`,
  `resolveJailbreak`, `endTurn`). Each one: check identity → check the move is legal
  via the engine → save → live-sync fires.
- **One thing `studio` never finished:** its live-sync listens broadly and filters
  after. Do targeted per-table filtering from day one.

See also: `docs/MASTER_PROJECT_BRIEF.md`.
