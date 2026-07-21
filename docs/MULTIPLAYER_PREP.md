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

## Tracker sync — a good first use of Supabase, before multiplayer (2026-07-21)

The playtest Tracker lives in `localStorage`, so the record is per-device *and* per-URL:
phone, iPad, and computer each keep their own, and every new Netlify Drop URL starts empty
— shipping a build wipes it. Manual export/import works (merges, deduped by game id) but
is tedious, and getting a file off a phone is worse.

**This does not need the multiplayer work.** At game end the Tracker posts its record to a
single insert-only table. Every device writes to the same place; build drops stop mattering.

- One table, insert-only. No login, no reads from the game, no realtime, no RLS puzzle.
- `localStorage` stays primary and the post is best-effort, so a dead network never blocks
  a game — records sync later. The game must stay fully playable offline.
- Game ids already exist, so re-sending is harmless.
- Free tier is far more than enough.

Roughly half a day, and it is not throwaway: it stands up the Supabase project multiplayer
needs anyway, with a low-stakes first use. Good rehearsal. The one real cost is that
`app/index.html` is currently 100% offline with no network calls — this adds a dependency,
so it needs care. Archived exports meanwhile live in `docs/playtest-data/`.

## Quick chat / taunts (online-only, decided 2026-07-21)

Nick's ask: a way to talk to remote players mid-game — "type a note, hit send, it goes to
the server like a card, and gets delivered to the player you're targeting."

**The instinct is right, with one refinement.** A card play has to be *checked* (is it your
turn, is the move legal) — that's the rules engine, the hard part. A message needs none of
that: anyone can send anytime, nothing to validate. So it's **simpler** than a card, and it
rides the same live-sync pipe you're building anyway. That's why it's cheap — but only
*after* the multiplayer skeleton exists. Standalone, it would mean building the whole
Supabase realtime stack just to send "nice play."

**Decision: do canned quick-chat first, free text later (if at all).** Reasons:

- This is a mobile game. A keyboard covers the board and typing mid-turn stalls play.
- Taunts fit the pirate theme far better than a chat bubble — and `app/assets/sfx-taunt.mp3`
  already ships in the build. The taunt laugh exists; it just has no one to taunt yet.
- No abuse surface, no moderation question, nothing to design around.

**Two things to settle before free text ever ships:**

- **Collusion.** With secret hands in a 3–4 player game, a private channel lets two players
  coordinate for real advantage. This is a game-design call, not a technical one: private
  DMs, or is everything visible to the table? Quick-chat is broadcast-only, which sidesteps
  it entirely for now.
- **Privacy has to be enforced by the database, not the UI.** If "private" only means hidden
  on screen, anyone with mobile dev tools reads every message. That means row-level security
  — `studio`'s RLS migration 003 is the pattern to copy.

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
  after. Do targeted per-table filtering from day one. **Quick chat makes this
  urgent, not just tidy:** under the broad-listen pattern every chat message would
  trigger a full game-state refetch on every device. Chat is chatty — the board would
  be re-downloaded constantly. Subscribe to `messages` separately from `games`.
- **Quick chat schema (rough):** a `messages` table (`game_id`, `sender_seat`,
  `recipient_seat` nullable = broadcast, `preset_key` for canned taunts, `body`
  nullable for future free text, `created_at`). Canned messages send a `preset_key`,
  not a string, so the client owns the wording and the SFX — smaller payloads and
  the taunt list can be re-themed without a migration. No server action needed
  beyond an insert; it bypasses the rules engine entirely (see the quick-chat
  section above).

See also: `docs/MASTER_PROJECT_BRIEF.md`.
