---
name: release-ops
description: Use when working on CI or GitHub Actions (`.github/workflows/*`), deploys, Vercel, migrations reaching develop or prod, nightly backups, restore or the restore drill, health checks, the three environments, per-environment R2 buckets, Resend/SMTP auth email, Sentry, the domain cut-over, NFC card writing, or onboarding the first prod users. Also when a PR check fails ("backdated migration"), a deploy waits for approval, a scheduled workflow stopped running, or Supabase free pauses.
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

## Pieces

| Concern | Where |
|---|---|
| PR checks: `app`, `test`, `migrations`, `types`, `main-source` | `.github/workflows/ci.yml` |
| Deploy: `plan` → `backup` (main) → `release` (migrate + Vercel hook) | `.github/workflows/deploy.yml` |
| Nightly prod dump to the backups bucket (also called by deploy) | `.github/workflows/backup.yml` |
| Daily pings of both Supabase projects + both `/login` pages | `.github/workflows/health.yml` |
| Weekly restore of the newest backup | `.github/workflows/restore-drill.yml` |
| Security-only dependency PRs | `.github/dependabot.yml` |
| Disable Vercel auto-deploy for `main`/`develop` | `vercel.json` |
| Migration rules check (edit/rename/delete/backdated, `--include-seed`) | `scripts/check-migrations.mts`, `scripts/lib/*` |
| Newest-backup picker; drill assertions | `scripts/latest-backup.mts`, `scripts/restore-check.mts` |
| Seed the local R2 bucket | `yarn r2:seed-local` → `scripts/r2-seed-local.mts` |
| Develop-only account creation | `scripts/invite-users.mts` (+ gitignored `scripts/users.local.json`, template `users.example.json`) |
| Hosted-data guard hook | `.claude/hooks/guard-db.sh` (wired in `.claude/settings.json`) |
| Seed split | `supabase/seed.sql`, gitignored `supabase/seed.local.sql` ([[catalog-schema]]) |
| R2 CORS per bucket | `infra/r2/cors.{local,dev,prod}.json` (files created during setup; not in the repo as of 2026-10-05) |
| Sentry (errors only) | `instrumentation-client.ts`, `src/instrumentation.ts`, `sentry.{server,edge}.config.ts`, `src/lib/observability/errors-only-integrations.ts`, `withSentryConfig` in `next.config.ts` |
| Typecheck | `yarn typecheck` (CI runs it) |
| Secrets: DB URLs + Vercel hooks | GitHub environment secrets (`develop`, `production`; prod DB URL also in `production-preflight`) |
| Secrets: backup R2 token | GitHub secrets (`BACKUP_R2_*`), never on a laptop |
| Secrets: app (`R2_*`, Supabase keys, `SITE_URL`, Sentry) | Vercel env vars per environment; the owner pastes them, never Claude |
| Health-check URLs/keys | GitHub repository variables `{DEV,PROD}_{SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SITE_URL}` |

## References

- [environments.md](References/environments.md) — the environments table, Vercel env-var
  matrix, hosted Auth settings (Resend SMTP, rate limits), Sentry.
- [pipeline.md](References/pipeline.md) — CI jobs, deploy flow, GitHub environments, branch
  rules, approving a prod deploy, failures, scheduled-workflow pitfalls.
- [migrations.md](References/migrations.md) — add-only rule, expand/contract worked example,
  first-rollout history check.
- [backups-and-restore.md](References/backups-and-restore.md) — backup layout, lock and
  lifecycle, the weekly drill, the prod restore runbook.
- [onboarding.md](References/onboarding.md) — first prod admin, then `/admin/users`; develop accounts.
- [domain-cutover.md](References/domain-cutover.md) — checklist when the domain is bought; NFC card writing and locking.

## Depends on

[[catalog-schema]] (migrations, seed, types), [[media-storage]] (buckets, tokens, CORS),
[[auth]] (hosted settings, templates), [[invites]] (`/admin/users`, `SITE_URL`, NFC links).

## Known deferrals (as of 2026-10-05)

- The domain is not bought yet (D6): environments use `*.vercel.app`; Resend sends from
  `onboarding@resend.dev` (delivers only to the Resend account owner).
- No develop DB backups and no backup encryption (deliberate).
- No edit/delete releases yet; when built it must soft-delete (prod bucket is locked).
- Copilot review not set up. `infra/r2/cors.*.json` are user-pasted into Cloudflare.
- Never add a payment method to Sentry (free Developer plan only).
