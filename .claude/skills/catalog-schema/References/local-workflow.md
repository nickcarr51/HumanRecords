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
`otp_length = 8`, `otp_expiry = 3600`, custom `invite`/`magic_link` templates in
`supabase/templates/` (see [[auth]]).

## Seed (`supabase/seed.sql`)

Local only — never run against hosted. Creates users through `pg_temp.seed_user(email, role,
name)` (role goes into `raw_app_meta_data`, name into `raw_user_meta_data`), which inserts `auth.users` + `auth.identities` (so the trigger makes the
`public.users` row) with a **random unknown password** — seeded accounts are OTP-only, never a
password backdoor.

| Account | Role |
|---|---|
| `listener@example.com` | listener |
| `artist@example.com` | artist |
| `label@example.com` | label_member |

Sign in as any of them via the real `/login` flow; read the code in Mailpit.

Catalog: artists Castillonaire, Sawcy, Quinoa Jones, Daye; album "The Breaks" (2 tracks, one
co-credited); single "LET EM KNOW" (newest); a release row for each; one download and two play
counts. `audio_url` values are real object keys in the `humanrecords-media-dev` R2 bucket.

## Adding a migration

1. `yarn supabase migration new <snake_name>` → `supabase/migrations/<timestamp>_<name>.sql`.
2. Write SQL. Migrations are forward-only; never edit one that's been pushed to a hosted
   project — add a new one. Comment the *why* at the top (house style).
3. `yarn supabase migration up` locally (keeps data). Use `db reset` only if you edited an
   already-applied migration — it wipes local data; say so first (see CLAUDE.md "Database safety").
4. Regenerate types (see [clients-and-types.md](clients-and-types.md)).
5. Update `seed.sql` if new `not null` columns or tables need local data.
6. Add/adjust schema tests.

## Hosted projects

`develop` branch ↔ "develop" Supabase project; `main` ↔ "production". Pushing migrations:

```bash
yarn supabase link --project-ref <ref>
yarn supabase db push --dry-run   # confirm exactly the new files
yarn supabase db push
```

**Before any hosted push:** confirm Dashboard → Authentication → "Allow new users to sign up"
is OFF (the app is invite-only; role no longer reads `user_metadata`, see [functions.md](functions.md)). Hosted accounts come from
`scripts/invite-users.mts` (develop) or by hand (production) — never from the seed.

The local CLI stays linked to the develop project, so `db push` and any `--linked` /
`--db-url` / `--project-ref` command reach hosted data. `.claude/hooks/guard-db.sh` (wired in
`.claude/settings.json`) forces a permission prompt on these; local commands pass through.

## Data / schema tests

- Files: `*.data.test.ts` (query functions) and `users|artists|catalog|catalog-relations.test.ts`
  (schema + RLS). All need the local stack running.
- `test-helpers.ts` **throws at import** unless `NEXT_PUBLIC_SUPABASE_URL` is
  `127.0.0.1`/`localhost` — these tests create and delete real rows.
- `createAdminClient()` (service role) seeds fixtures; `createTestUser({ role, name })` (role in `app_metadata`, name in `user_metadata`) creates a
  confirmed auth user and returns `{ id, email, signIn, cleanup }`. `signIn()` uses
  `admin.generateLink('magiclink')` + `verifyOtp({ token_hash, type: 'email' })` — the real
  OTP path, no password.
- Always clean up in `finally`/`afterEach` (delete the user; delete catalog rows you inserted).
- Vitest loads `.env*` via `loadEnv` in `vitest.config.mts`, so `.env.local` keys apply.

```bash
yarn supabase start
yarn test --run src/lib/supabase
```

A connection error when the stack is down is environment, not a regression.
