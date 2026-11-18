# Reference: Local Supabase workflow, seed, and data tests

## Local stack

Supabase CLI via yarn (Docker required). Ports from `supabase/config.toml`:

| Service | URL |
|---|---|
| API | `http://127.0.0.1:54321` |
| Postgres | `127.0.0.1:54322` |
| Studio (GUI) | `http://127.0.0.1:54323` |
| Mailpit (inbox for OTP emails) | `http://127.0.0.1:54324` |

```bash
yarn supabase start        # bring the stack up (prints keys for .env.local)
yarn supabase migration up # apply only pending migrations — keeps local data (default)
yarn supabase db reset     # WIPES local data: drop DB, re-run every migration, then seed.sql
yarn supabase status       # show URLs + keys again
yarn supabase stop
```

Auth settings that matter locally: `enable_signup = false` (invite-only), email
`otp_length = 6`, `otp_expiry = 3600`, custom `invite`/`magic_link` templates in
`supabase/templates/` (see [[auth]]).

## Seed (`supabase/seed.sql` + `supabase/seed.local.sql`)

Local only — never run against hosted (and never `--include-seed` against a hosted DB; CI rejects it). Creates users through `seed_helpers.seed_user(email, role,
name)` (a real helper schema, so it is visible to every seed file; role goes into `raw_app_meta_data`, name into `raw_user_meta_data`), which inserts `auth.users` + `auth.identities` (so the trigger makes the
`public.users` row) with a **random unknown password** — seeded accounts are OTP-only; nobody can
sign in to them with a password.

| Account | Role |
|---|---|
| `listener@example.com` | listener |
| `artist@example.com` | artist |
| `label@example.com` | label_member |

Sign in as any of them via the real `/login` flow; read the code in Mailpit.

**Real accounts locally:** `supabase/seed.local.sql` is gitignored and holds your real
emails. Copy `supabase/seed-local.example.sql` to `supabase/seed.local.sql` and edit it; it
calls `seed_helpers.seed_user(...)`. `config.toml` loads
`sql_paths = ["./seed.sql", "./seed.local*.sql"]`, so `db reset` runs `seed.sql` first, then
your local file. The local file is optional: when it is absent (CI, fresh clones) the reset
still seeds the committed catalog without error. Never commit it (repo is public).

Warning: `seed.sql` creates a local-only `seed_helpers` schema; never let `supabase db diff` capture it into a migration.

Catalog: artists Halcyon, Ember, Juno Park, Nova; album "Sample Album" (2 tracks, one
co-credited); single "SLOW BLOOM" (newest); a release row for each; one download and two play
counts. `audio_url` values are object keys. Locally they point at the `humanrecords-media-local`
bucket: put the seed MP3s in gitignored `supabase/seed-media/` and run `yarn r2:seed-local`
(see [[media-storage]]).

## Adding a migration

1. `yarn supabase migration new <snake_name>` → `supabase/migrations/<timestamp>_<name>.sql`.
2. Write SQL. Migrations are forward-only; never edit one that's been pushed to a hosted
   project — add a new one. Comment the *why* at the top (house style).
3. `yarn supabase migration up` locally (keeps data). Use `db reset` only if you edited an
   already-applied migration — it wipes local data; say so first (see CLAUDE.md "Database safety").
   Adding a required column to a populated table? Follow the backfill dance: add nullable →
   `update` → `set not null` (`position` in `20260929120000`, `catalog_number` in `20261011170000`,
   which then adds `generated always as identity` + `setval` so new rows continue the sequence).
4. Regenerate types and re-pull the Drizzle schema (`yarn db:pull`; see
   [clients-and-types.md](clients-and-types.md)).
5. Update `seed.sql` if new `not null` columns or tables need local data.
6. Add/adjust schema tests.

## Hosted projects

`develop` branch ↔ "develop" Supabase project; `main` ↔ "production". **Hosted migrations
reach the databases via `deploy.yml` only** (merge to `develop` / `main`; prod waits for an
Approve click). Do not push from a laptop. See [[release-ops]] `References/pipeline.md`.

Migrations must be add-only and keep the currently deployed code working (expand/contract —
renames/drops take two releases). Worked example: [[release-ops]] `References/migrations.md`.
CI's `migrations` job fails any edited, renamed, or deleted migration, and any new file whose
timestamp is not newer than the base branch's newest.

**Auth setting to keep OFF on every hosted project:** Dashboard → Authentication → "Allow new
users to sign up" (the app is invite-only; role no longer reads `user_metadata`, see
[functions.md](functions.md)). Hosted accounts, develop and production, come from `/admin/users`
(see [[invites]] and [[release-ops]] `References/onboarding.md`) — never from the seed.

The local CLI stays linked to the develop project, so `db push` and any `--linked` /
`--db-url` / `--project-ref` command reach hosted data. `.claude/hooks/guard-db.sh` (wired in
`.claude/settings.json`) forces a permission prompt on these, on `drizzle-kit push|migrate|drop|up`,
on `drizzle-kit` with a hosted host, and on any command carrying a hosted database URL (e.g.
`DATABASE_URL=<hosted> yarn test`); local commands pass through ([[db-access]]
`References/guard-rails.md`).

### Switched branches and the app or a test now fails with 42703?

Symptom: `/feed` or `/albums/[id]` throws, or a `db` test fails, with Postgres error `42703`. The
Drizzle read `getFeed` reports it as a `DatabaseError` ("Database query failed",
`code: "42703"`; the SQL text is never kept, [[db-access]]); `getAlbum` (supabase-js since slice
2) throws the supabase-js error with `code: "42703"`. The supabase-js test
`catalog-numbers.data.test.ts` fails at its
first `expect`; the select's own error (`column tracks.catalog_number does not exist`, or
`albums.catalog_number` in the album test) isn't printed. Cause: the checked-out code selects
`catalog_number` (added by `20261011170000`) but your local database hasn't run that migration
yet. Fix: `yarn supabase migration up` (only pending migrations, keeps data) — **not**
`db reset`. Going the other way (older branch, newer DB) is harmless: the column is additive and
old code never asks for it. The same symptom on a hosted environment means `deploy.yml` hasn't
run the migration there yet; wait for the deploy, don't push by hand.

## Data / schema tests

- Files: `*.data.test.ts` (query functions) and `users|artists|catalog|catalog-relations.test.ts`
  (schema + RLS). All need the local stack running.
- **Two Vitest projects** (`vitest.config.mts`): `unit` (parallel, excludes DB tests) and `db`
  (`fileParallelism: false`). DB-backed files share one local database and some assert on global
  ordering (top of the feed), so they must run serially. The `db` project includes
  `src/**/*.data.test.ts` plus the `dbTests` list. **A new DB-backed test not named
  `*.data.test.ts` must be added to `dbTests`**, or it runs in parallel in `unit`.
- `test-helpers.ts` **throws at import** unless `NEXT_PUBLIC_SUPABASE_URL` is
  `127.0.0.1`/`localhost`, and also when `DATABASE_URL` is set to any other host (an unparseable
  URL counts as non-local) — these tests create and delete real rows.
- **Drizzle data tests** (`src/lib/db/*.data.test.ts`, `src/lib/services/*.data.test.ts`,
  `*.parity.data.test.ts`, `*.drizzle.data.test.ts`, `*-row-cap.data.test.ts`,
  `src/lib/admin/artists-links.data.test.ts`) also need `DATABASE_URL` in `.env.local`, set to the
  local stack: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Each starts with
  `// @vitest-environment node` (older data tests that reach Drizzle run in jsdom, where
  postgres.js works too). What each proves:
  [[db-access]] `References/testing.md`.
- `createAdminClient()` (service role) seeds fixtures; `createTestUser({ role, name })` (role in `app_metadata`, name in `user_metadata`) creates a
  confirmed auth user and returns `{ id, email, signIn, cleanup }`. `signIn()` uses
  `admin.generateLink('magiclink')` + `verifyOtp({ token_hash, type: 'email' })` — the real
  OTP path, no password.
- Always clean up in `finally`/`afterEach` (delete the user; delete catalog rows you inserted).
- **Catalog fixtures: `src/lib/supabase/release-admin-fixtures.ts`.** New data tests that need
  releases should use it rather than hand-rolling inserts: `admin` (service-role client), `newTag(prefix)`
  (unique tag; put it in every title/name/key you create), `makeSingle(tag)` → `{ releaseId, trackId }`,
  `makeAlbum(tag, nTracks)` → `{ releaseId, albumId, trackIds }`, `makeArtist`, `signedIn(role)` (a
  signed-in client for a fresh test user), `archivedAt`, `positions`, `queueRows`, and `cleanup(tag)` in
  `afterEach`. `cleanup` deletes by tag (tracks/albums cascade to releases and link rows) and removes
  the test users — it never bulk-deletes, so other tests' and the seed's rows survive. Deleting fixture
  rows consumes `catalog_number`s; that is fine and expected (never reused). Used by
  `{archive-release,archive-track,add-track-replace-audio,update-release,catalog-numbers}.data.test.ts`.
- Vitest loads `.env*` via `loadEnv` in `vitest.config.mts`, so `.env.local` keys apply.

```bash
yarn supabase start
yarn supabase migration up                                      # pending migrations first, or expect 42703
yarn test --run src/lib/supabase src/lib/db src/lib/services     # the data layer folders
yarn vitest run --project db src/lib/supabase/catalog-numbers.data.test.ts   # one db file
```

Run a single DB-backed file with `--project db` so it uses the serial project (and the `.env.local`
keys); the migration it covers must already be applied locally.

A connection error when the stack is down is environment, not a regression.
