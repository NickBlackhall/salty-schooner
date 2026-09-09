-- Playtest tracker sync — one insert-only table.
--
-- Problem this solves: the Tracker lives in localStorage, so the record is per-device
-- AND per-URL. Phone, iPad and laptop each keep a separate record, and every new
-- Netlify Drop URL started empty, so shipping a build wiped the history. Manual
-- export/import worked but was tedious, and getting a file off a phone is worse.
--
-- Design constraints (from docs/MULTIPLAYER_PREP.md):
--   * Insert-only. The game never reads and never updates. Nick reads via the dashboard.
--   * No login, no realtime, no RLS puzzle.
--   * localStorage stays primary; the post is best-effort so a dead network never
--     blocks a game. The game must remain fully playable offline.
--   * Re-sending a record is harmless — game ids already exist and are unique.
--
-- This is deliberately NOT the multiplayer schema. Multiplayer needs games/players/
-- game_events with row-level security over private hands; that lands separately.

create table if not exists public.playtest_games (
  id           bigint generated always as identity primary key,

  -- The Tracker's own game id (Telemetry.newId()). Unique so a re-send is a no-op.
  game_id      text not null unique,

  -- Which build produced this record, and which device it came from. The device
  -- columns are what make the per-device split legible once records pool here:
  -- device_id is a random per-browser string, NOT an identifier of a person.
  build        text,
  device_id    text,
  device_label text,

  started      timestamptz,
  ended        timestamptz,
  completed    boolean not null default false,
  abandoned    boolean not null default false,
  ended_early  boolean not null default false,
  winner       text,
  rounds       integer,

  players      jsonb,
  scores       jsonb,
  stats        jsonb,
  round_log    jsonb,
  turn_log     jsonb,

  received_at  timestamptz not null default now(),

  constraint playtest_games_game_id_len check (char_length(game_id) between 1 and 64)
);

comment on table public.playtest_games is
  'Insert-only playtest telemetry from the Salty Schooner client. localStorage is primary; these are best-effort copies so the record survives a new device or a new deploy.';

create index if not exists playtest_games_received_at_idx on public.playtest_games (received_at desc);
create index if not exists playtest_games_started_idx     on public.playtest_games (started desc);

-- Row-level security: the anon key may INSERT and nothing else.
-- With no SELECT/UPDATE/DELETE policy, those are denied for anon even though the
-- publishable key ships inside app/index.html. Reads happen in the dashboard, which
-- uses the service role and bypasses RLS.
alter table public.playtest_games enable row level security;

drop policy if exists "anon may insert playtest records" on public.playtest_games;
create policy "anon may insert playtest records"
  on public.playtest_games
  for insert
  to anon, authenticated
  with check (true);
