---
name: release-ops
description: Use when working on CI or GitHub Actions (`.github/workflows/*`), deploys, Vercel, migrations reaching develop or prod, nightly backups, restore or the restore drill, health checks, the three environments, per-environment R2 buckets, Resend/SMTP auth email, Sentry, the domain cut-over, NFC card writing, or onboarding the first prod users, the app's `DATABASE_URL` (each project's transaction pooler URL in Vercel; verified TLS with the embedded Supabase CA certificate), the database health check (`/api/health/db`, the "Site database answers" steps in `deploy.yml` and `health.yml`), the guard-hook rules for `drizzle-kit` and hosted database URLs, or the CI `types` job's `yarn db:pull` schema diff. Also when a PR check fails ("backdated migration"), a deploy waits for approval, a scheduled workflow stopped running, or Supabase free pauses.
---

# Release Ops: environments, pipeline, backups

How code, database migrations, and media move through three isolated environments
(local Docker, develop, production) on free tiers, and how prod data is protected.

## The one thing to understand first

**GitHub Actions is the only path to hosted databases. Prod waits for an Approve click.
Vercel deploys only after the migrations succeed.** Merging to `develop` or `main` triggers
`deploy.yml`: dry-run plan, (prod only) backup, then migrate and call the Vercel deploy hook.
Vercel git auto-deploy is disabled for those two branches (`vercel.json`), so a failed
migration means no new code goes live. Claude never pushes migrations from a laptop and never
touches hosted data without explicit permission in the moment (guard hook enforces a prompt).

Deploy checklist addition: if a change alters what the browser requests from R2 (e.g.
a `fetch` of an R2 URL from a new origin, a new method or header), apply the CORS JSON to that env's bucket
**before** the deploy — the owner pastes `infra/r2/cors.<env>.json` into Cloudflare and updates
the status table in `infra/r2/README.md` (see [pipeline.md](References/pipeline.md)).

## Pieces

| Concern | Where |
|---|---|
| PR checks: `app`, `test`, `migrations`, `types` (incl. the `yarn db:pull` schema diff), `main-source` | `.github/workflows/ci.yml` |
| Deploy: `plan` → `backup` (main) → `release` (migrate + Vercel hook + poll `/api/health/db`) | `.github/workflows/deploy.yml` |
| Nightly prod dump to the backups bucket (also called by deploy) | `.github/workflows/backup.yml` |
| Daily pings of both Supabase projects, both `/login` pages and both `/api/health/db` (the app's own database connection, [[db-access]]) | `.github/workflows/health.yml` |
| Weekly restore of the newest backup | `.github/workflows/restore-drill.yml` |
| Security-only dependency PRs | `.github/dependabot.yml` |
| Disable Vercel auto-deploy for `main`/`develop` | `vercel.json` |
| Migration rules check (edit/rename/delete/backdated, `--include-seed`) | `scripts/check-migrations.mts`, `scripts/lib/*` |
| Newest-backup picker; drill assertions | `scripts/latest-backup.mts`, `scripts/restore-check.mts` |
| Seed the local R2 bucket | `yarn r2:seed-local` → `scripts/r2-seed-local.mts` |
| Account creation (develop and production, after the first prod admin) | `/admin/users` ([[invites]]); see `References/onboarding.md` |
| Hosted-data guard hook (Supabase/R2/prod names, plus `drizzle-kit push\|migrate\|drop\|up`, `drizzle-kit` with a hosted host, and any command with a hosted database URL) | `.claude/hooks/guard-db.sh` (wired in `.claude/settings.json`) |
| Seed split | `supabase/seed.sql`, gitignored `supabase/seed.local.sql` ([[catalog-schema]]) |
| R2 CORS per bucket (`GET`/`HEAD`/`PUT`, applied to all three buckets 2026-10-11) | `infra/r2/cors.{local,dev,prod}.json`, status table in `infra/r2/README.md` |
| Sentry (errors only) | `instrumentation-client.ts`, `src/instrumentation.ts`, `sentry.{server,edge}.config.ts`, `src/lib/observability/errors-only-integrations.ts`, `withSentryConfig` in `next.config.ts` |
| Typecheck | `yarn typecheck` (CI runs it) |
| Secrets: DB URLs + Vercel hooks | GitHub environment secrets (`develop`, `production-release`; prod DB URL also in `production-preflight`) |
| Secrets: backup R2 token | GitHub secrets (`BACKUP_R2_*`), never on a laptop |
| Secrets: app (`R2_*`, Supabase keys, `DATABASE_URL`, `SITE_URL`, Sentry) | Vercel env vars per environment; the owner pastes them, never Claude |
| Health-check URLs/keys | GitHub repository variables `{DEV,PROD}_{SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SITE_URL}` |

## References

- [environments.md](References/environments.md) — the environments table, Vercel env-var
  matrix, the hosted database checks (a)-(h), hosted Auth settings (Resend SMTP, rate limits),
  Sentry.
- [pipeline.md](References/pipeline.md) — CI jobs, deploy flow, GitHub environments, branch
  rules, approving a prod deploy, failures, scheduled-workflow pitfalls.
- [migrations.md](References/migrations.md) — add-only rule, expand/contract worked example,
  first-rollout history check.
- [backups-and-restore.md](References/backups-and-restore.md) — backup layout, lock and
  lifecycle, the weekly drill, the prod restore runbook.
- [onboarding.md](References/onboarding.md) — first prod admin, then `/admin/users`; develop accounts.
- [domain-cutover.md](References/domain-cutover.md) — cut-over checklist (done 2026-10-09 for prod) and DNS records; NFC card writing and locking.

## Depends on

[[catalog-schema]] (migrations, seed, types), [[media-storage]] (buckets, tokens, CORS),
[[auth]] (hosted settings, templates), [[invites]] (`/admin/users`, `SITE_URL`, NFC links),
[[db-access]] (`DATABASE_URL`, the health check, the Drizzle hook and lint rules).

## Known deferrals (as of 2026-10-10)

- Prod is on `https://services.humanrecords.co`; develop stays on `humanservices-dev.vercel.app`
  (no dev subdomain, decided). Auth email sends from `noreply@humanrecords.co`.
- No develop DB backups and no backup encryption (deliberate).
- Release edit/delete is built (`/admin/releases`); "delete" is a soft-delete via archive (prod bucket is locked, nothing is removed from R2).
- Copilot review is permanently off. `infra/r2/cors.*.json` are user-pasted into Cloudflare (all three buckets on `GET`/`HEAD`/`PUT` since 2026-10-11).
- Never add a payment method to Sentry (free Developer plan only).
