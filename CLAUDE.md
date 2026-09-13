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
- Feature branches get Vercel's automatic ephemeral previews

## Workflow

- Work on feature branches, optionally split across multiple git
  worktrees; merge worktrees back into one feature branch before opening
  a PR.
- Feature branch → PR into `develop`. `develop` → PR into `main`. Always
  a PR, never a direct merge.
- The user merges PRs manually on GitHub. Never merge your own PR.
- CI and Copilot review are planned but not set up yet.

## Docs

`docs/` is gitignored — it's for local working notes/specs/plans, not
checked in, with the exception of specs explicitly committed as a
historical record (e.g. the original project bootstrap spec).

## Project skills

`.claude/skills/` holds project-specific Claude Code skills, added as
features are built.

## Out of scope so far

Supabase client/env wiring, Cloudflare R2, any auth/invite flow,
dashboard UI. See `docs/superpowers/specs/2026-09-12-project-bootstrap-design.md`
for the full bootstrap design rationale.
