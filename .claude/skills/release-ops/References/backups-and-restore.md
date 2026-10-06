# Reference: Backups, drill, restore

## Backups (`backup.yml`)

Triggers: nightly cron (09:00 UTC, about 2am Pacific), `workflow_dispatch`, and `workflow_call`
from `deploy.yml` before every prod migration. Three dumps via `supabase db dump --db-url`:
`roles.sql` (`--role-only`), `schema.sql`, `data.sql` (`--data-only --use-copy`), gzipped, copied
with the AWS CLI to `humanrecords-backups/prod/<UTC timestamp>/` (`roles.sql.gz`, `schema.sql.gz`,
`data.sql.gz`). They include `auth.users` and `auth.identities`.

The bucket has a 30-day object lock (no delete/overwrite) and a 90-day lifecycle expiry. Its token
is scoped to that bucket and stored only in GitHub secrets (D15: no laptop key). A failed
scheduled run emails the owner. To inspect a backup's data locally, download the object via the
Cloudflare dashboard (there is no workflow-artifact download).

## Weekly restore drill (`restore-drill.yml`)

Mondays 12:00 UTC, plus `workflow_dispatch` for a manual run. On the runner it checks out its own
ref (scripts and config), then fetches `main` and fails fast with "main has no supabase/migrations
yet — the drill runs after the first prod release" if main has none. Otherwise it removes the
local `supabase/migrations` and checks out main's exact set (so stray migrations from the drill's
ref cannot leak in; the schema must match prod). It then downloads the newest `data.sql.gz`, starts a throwaway local Supabase, runs
`db reset --no-seed`, loads the data with `session_replication_role = replica`, then
`scripts/restore-check.mts` asserts accounts > 0 and `public.users` = `auth.users`. Failure emails
the owner.

Known causes of a red drill:
- Before the first prod release: `main` has no migrations yet (the fail-fast message above), or
  no backups exist yet in the bucket. Both resolve after the first prod deploy and first backup.
- Hosted `auth`/`storage` schema is newer than the local images of the pinned Supabase CLI: COPY
  fails with a column mismatch. Bump `supabase` in `package.json`.
- The dump lacks `auth` rows: "no accounts". Investigate the backup before trusting it.

## Prod restore runbook (new project, preferred)

1. Pause and leave the old project alone. Create a new Supabase project (free tier allows two
   active; delete or pause another if needed).
2. Download `roles.sql.gz`, `schema.sql.gz`, `data.sql.gz` of the chosen backup from the
   Cloudflare dashboard; gunzip them.
3. Get the new project's **Session pooler** connection string (percent-encoded) as `NEW_DB_URL`.
4. Restore:
   ```bash
   psql --single-transaction -v ON_ERROR_STOP=1 \
     -f roles.sql -f schema.sql \
     -c 'set session_replication_role = replica' \
     -f data.sql "$NEW_DB_URL"
   ```
5. Re-apply hosted Auth settings ([environments.md](environments.md)) and email templates.
6. Repoint Vercel Production `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, publishable key,
   `SUPABASE_SECRET_KEY`; update the `production` / `production-preflight` `DB_URL` secrets and the
   `PROD_*` health variables; redeploy. Smoke test sign-in.
7. R2 media is unaffected (separate, locked bucket).

**In place** (restoring into the existing prod project) overwrites live data: only with an
explicit decision from the owner, after taking a fresh backup. Every command here names prod or the
backups bucket, so the guard hook will prompt; that is expected.
