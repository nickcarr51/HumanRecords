# Human Services

Invite-only web repository for Human Records' music. Long-term there are
three user tiers — listener, artist, label member — with artists and
label members getting dashboard access (label members get additional
dashboard features). None of that auth/role logic exists yet; it's noted
here so future work doesn't contradict it.

## Stack

- Next.js 15 (App Router), TypeScript, `src/` layout, `@/*` path alias
- yarn (not npm/pnpm)
- styled-components only (no Tailwind, no CSS Modules) — SSR registry in
  `src/lib/registry.tsx`, wired into `src/app/layout.tsx`
- Vitest + React Testing Library for tests, colocated as `*.test.tsx`
- Node 22 (see `.nvmrc`)

## Environments

- `main` branch → Vercel Production, tied to the "production" Supabase project
- `develop` branch → Vercel Preview/staging, tied to the "develop" Supabase project
- Feature branches get Vercel's automatic ephemeral previews (develop Supabase + dev bucket)
- Three R2 media buckets, one bucket-scoped token each: `humanrecords-media-local`
  (local), `-dev` (develop), `-prod` (production, locked: prod code never deletes objects).
  `humanrecords-backups` holds nightly prod DB dumps (GitHub-only access).
- Vercel git auto-deploy is off for `main`/`develop` (`vercel.json`). `deploy.yml`
  migrates the hosted DB, then calls a Vercel deploy hook; prod waits for an Approve click.
  Details: `.claude/skills/release-ops/`

## Workflow

- Work on feature branches, optionally split across multiple git
  worktrees; merge worktrees back into one feature branch before opening
  a PR.
- Feature branch → PR into `develop`. `develop` → PR into `main`. Always
  a PR, never a direct merge.
- The user merges PRs manually on GitHub. Never merge your own PR.
- CI exists (`.github/workflows/ci.yml`: `app`, `test`, `migrations`, `types`, and
  `main-source` for PRs into `main`); these are required checks on `develop` and `main`.
  Copilot review is planned, not set up.
- Deploys happen only through `.github/workflows/deploy.yml` on push to `develop`/`main`.
- Migrations are add-only and must keep the currently deployed code working
  (expand/contract); see the `release-ops` skill.

## Database safety

- **Hosted databases (develop + production): never write to, wipe, or delete
  without the user's explicit permission in the current conversation.** This
  repo's Supabase CLI is linked to the hosted develop project, so `db push`,
  any `--linked` / `--db-url` / `--project-ref` command, `migration repair`,
  and psql against `*.supabase.co` reach real data. A PreToolUse hook
  (`.claude/hooks/guard-db.sh`, wired in `.claude/settings.json`) forces a
  permission prompt on these, on R2 deletes (`aws s3 rm|rb|mv`, `sync --delete`,
  `rclone delete|purge`, `wrangler r2` deletes), and on any command naming the prod
  media bucket, the backups bucket, or the prod Supabase project ref.
- **Hosted migrations run only via GitHub Actions (`deploy.yml`)**, never from a
  laptop. Never `--include-seed` against a hosted database; seed is local-only.
- **Local:** apply new migrations with `yarn supabase migration up` — it runs
  only pending migrations and keeps data. `yarn supabase db reset` (wipes and
  re-seeds) is allowed when truly needed (e.g. an applied migration was
  edited), but say so before running it; data tests never need it.
  Optional backup first: `yarn supabase db dump --local --data-only -f backup.sql`
  (`backup*.sql` is gitignored).

## Docs

`docs/` is gitignored — it's for local working notes/specs/plans, not
checked in, with the exception of specs explicitly committed as a
historical record (e.g. the original project bootstrap spec).

## Project skills

`.claude/skills/` holds project-specific Claude Code skills, added as
features are built. `release-ops` covers environments, the CI/deploy pipeline,
migrations, backups/restore, prod onboarding, and the domain cut-over.

## Out of scope so far

dashboard UI (the auth/invite flow now exists; see the `auth` and `invites` skills). See `docs/superpowers/specs/2026-09-12-project-bootstrap-design.md`
for the full bootstrap design rationale.
