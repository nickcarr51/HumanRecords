# Reference: CI and deploy pipeline

## `ci.yml` (pull_request into `develop` or `main`)

| Job | What it does |
|---|---|
| `app` | `yarn install --frozen-lockfile`, `yarn lint`, `yarn typecheck`, `yarn build` (dummy env) |
| `test` | `supabase start` (minimal services), env from `supabase status`, full `yarn test` incl. DB-dependent files; no `seed.local.sql` in CI |
| `migrations` | `scripts/check-migrations.mts origin/<base>`: fails modified/renamed/deleted migrations, a new migration not newer than the base's newest, and `--include-seed` in any workflow |
| `types` | regenerates `database.types.ts` from the local stack and diffs against the committed file |
| `main-source` | PRs into `main` must come from `develop` |

All are required checks (rulesets on `main` and `develop`: PR required, no force-push, no
deletion). CI uses fake R2 values; no test reaches a real bucket.

## `deploy.yml` (push to `develop` / `main`)

```
develop: plan (env develop) -> release (env develop): db push, Vercel develop hook
main:    plan (env production-preflight) -> backup (backup.yml) ->
         release (env production, Approve click): db push, Vercel prod hook
```

- `plan` runs `supabase db push --dry-run` and writes the pending list to the job summary, so
  the approver sees exactly what will run. It uses `production-preflight` (no reviewer) so the
  single approval comes after the dry run, on `release`.
- The `release` deploy step calls the Vercel hook only if its commit is still the branch tip; a
  newer queued run migrates and deploys instead (the hook builds the tip, so migrations must run first).
- Any failure stops later jobs. `concurrency: deploy-<branch>`, no cancel-in-progress.
- All workflows set `defaults.run.shell: bash` (so pipes fail on error).

## GitHub environments

| Environment | Reviewer | Holds |
|---|---|---|
| `develop` | none | `DB_URL` (develop **Session pooler** string), `VERCEL_DEPLOY_HOOK` |
| `production-preflight` | none | prod `DB_URL` for plan/backup/drill, backup R2 secrets |
| `production` | repo owner (required) | prod `DB_URL`, prod `VERCEL_DEPLOY_HOOK` |

`R2_ENDPOINT` is a **repository** variable (plan B6), not an environment item.

Deployment-branch policy for `production-preflight` is set during setup (see plan Task B6);
it must have no required reviewer and must permit the branches that run scheduled workflows.
GitHub runners are IPv4-only, so DB URLs must be the Supabase **Session pooler** connection
string, percent-encoded.

## Approving a prod deploy

Merge the `develop` -> `main` PR. Open Actions -> the Deploy run. Read the `plan` job summary
(pending migrations) and confirm `backup` is green. Open the waiting `release` job -> Review
deployments -> Approve. Reject to stop; nothing has changed yet.

## When a job fails

- `plan` fails: bad `DB_URL` (use the pooler string), or hosted history disagrees with the repo.
  Stop; do not `migration repair` without the user's permission ([migrations.md](migrations.md)).
- `backup` fails: prod is not migrated; fix and re-run (see
  [backups-and-restore.md](backups-and-restore.md)).
- A failing prod `db push` can echo constraint-violation values (e.g. `Key (email)=(...)`) into
  the public Actions log. Treat such logs as sensitive and delete the run's logs in GitHub if it
  happens. The restore drill withholds its load output for the same reason.
- `release` fails mid-push: the Vercel hook did not run, so old code is still live. Fix forward
  with a new migration (never edit an applied one) and merge again.
- A CI `migrations` failure is a rule violation, not flakiness.

## Backdated-migration false alarm

The `migrations` check compares against the base branch **tip**. If `develop` gained a newer
migration since you branched, your PR is flagged "backdated". Fix: merge or rebase `develop`,
then rename your migration with a fresh timestamp: `yarn supabase migration new <name>`, move
the SQL in, delete your old unmerged file (it is new on your branch, so this is allowed).

## Scheduled workflows can silently stop

GitHub disables `schedule` triggers on public repos after 60 days with no repo activity. That
would silently stop the nightly backup, the weekly drill, and the keep-alive health ping
(Supabase free pauses after 7 idle days). Notice: Actions tab shows a banner "scheduled
workflows disabled", or no recent runs of Backup/Health. Fix: Actions -> the workflow -> Enable
workflow (or push any commit and re-enable), then run each once via workflow_dispatch. Check
monthly during quiet periods.
