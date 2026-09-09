# Deploying Salty Schooner — Netlify + Supabase

Written 2026-09-09. This replaces the Netlify Drop workflow described in older
`WORKLOG.md` entries.

---

## Why this changed

Builds used to ship via **Netlify Drop**: run `./build-drop-zip.sh`, download the zip,
drag it onto app.netlify.com/drop, get a **new random URL every time**.

That had a real cost beyond the manual steps. A new URL is a new **origin**, and
`localStorage` is per-origin — so every deploy silently wiped the playtest Tracker.
The whole export-before-you-drop / import-after ritual in the worklog existed only to
work around that. Continuous deploy from GitHub gives **one stable URL forever**, so
the Tracker survives deploys and the ritual goes away.

`build-drop-zip.sh` still works and is kept as a fallback (handy for handing someone a
build without a deploy), but it is no longer the normal path.

---

## Part 1 — Netlify (one-time, ~2 minutes in the UI)

The repo is already deploy-ready: `netlify.toml` at the root sets `publish = "app"`,
so Netlify serves `app/index.html` and `app/assets/` directly. There is no build step.

**Connect it:**

1. Netlify → **Add new site → Import an existing project → GitHub**.
2. Pick `NickBlackhall/salty-schooner`.
3. Netlify reads `netlify.toml`, so **leave the build settings blank** — publish
   directory is already set to `app`. Do not enter a build command.
4. Set the production branch to `main`.
5. Deploy.

From then on: **every push to `main` deploys automatically.** No zip, no drag, no new URL.

**About the existing site.** There is already a Netlify site for Salty Schooner (the
"usual" one, serving an older build) plus assorted throwaway Drop sites. Two options:

- **Point the existing site at the repo** — Site configuration → Build & deploy →
  *Link to a Git repository*. Keeps the URL people already have. Preferred.
- **Create a new site** and delete the stale ones once the new URL is in use.

Either works; linking the existing one avoids redistributing a URL.

**Caching.** `netlify.toml` marks `index.html` `must-revalidate` (so a deploy is picked
up immediately) and `assets/*` immutable for a year (so art and audio are not
re-downloaded every launch). Because the whole game is one HTML file, a deploy takes
effect on the next page load.

---

## Part 2 — Supabase (playtest Tracker sync)

### What this is, and what it is not

This is the **insert-only telemetry table** from `MULTIPLAYER_PREP.md` — deliberately
the smallest possible first use of Supabase. It is **not** the multiplayer schema.
Multiplayer needs `games` / `players` / `game_events` with row-level security over
private hands, and lands separately.

The point of doing it first: it stands up the Supabase project multiplayer needs anyway,
with low stakes and a real payoff — the Tracker record stops being trapped per-device.

### The schema

`supabase/migrations/0001_playtest_games.sql` creates one table, `public.playtest_games`,
with RLS enabled and exactly one policy: **anon may INSERT, nothing else.** No SELECT,
no UPDATE, no DELETE. The client can add records and can never read or change them.
You read them in the Supabase dashboard, which bypasses RLS.

`game_id` is unique, and the client posts with `Prefer: resolution=ignore-duplicates`,
so re-sending a record is a harmless no-op. That is what makes retries safe.

### Applying it

Either paste the migration into the dashboard **SQL Editor** and run it, or use the CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

### Wiring the game to it

Open `app/index.html`, find the `Cloud` object (search for `const Cloud = {`), and fill in
the two fields at the top from **Supabase → Project Settings → API**:

```js
URL: 'https://<project-ref>.supabase.co',
KEY: '<publishable / anon key>',
```

Leaving them empty is a supported state: sync is simply **off** and the game behaves
exactly as it did before. The Tracker panel says so.

**On shipping the key in client code:** a publishable/anon key is designed to be public,
and this one is powerless by construction — the RLS policy permits INSERT and nothing
else. Worst case, someone posts junk playtest rows. Never put the **service role** key
in `app/index.html`; it bypasses RLS entirely.

### How sync behaves

- Fires on **game end**, on **boot** (flushing anything queued), on **reconnect**, and
  from **Tracker → Sync now**.
- `localStorage` stays primary. The post is best-effort and is never awaited on any
  gameplay path.
- Any failure — no network, wrong key, project paused, RLS refusal — leaves the record
  queued locally and retries later. The game never blocks and never throws.
- At most 10 records per pass, so a long backlog drains over several passes rather than
  firing one huge request.
- Tracker shows `N synced, M waiting` plus the last attempt's result.

Verify with `node tests/cloud-sync.test.mjs` (30 assertions covering the failure paths).

---

## Everyday workflow now

1. Edit `app/index.html`, bump `APP_BUILD`, add a `WORKLOG.md` change-history entry.
2. `node tests/cloud-sync.test.mjs`
3. Commit and push to `main` → Netlify deploys automatically.
4. Confirm the build stamp on the live site matches what you shipped.
