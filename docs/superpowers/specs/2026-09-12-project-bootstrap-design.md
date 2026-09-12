# Human Services — Project Bootstrap Design

**Date:** 2026-09-12
**Status:** Approved
**Scope:** Scaffold a Next.js/TypeScript project and get a basic home page deployed to Vercel. Supabase (auth/DB) and Cloudflare R2 (audio storage) integration are explicitly out of scope for this pass — deferred to a follow-up spec.

## Context

Human Records (record label) is building "Human Services" — an invite-only web repository for the label's music. Longer-term the site has three user tiers: **listener**, **artist**, and **label member**, with artists and label members getting access to a dashboard (label members get additional dashboard features beyond artists). None of the auth/role logic is built in this pass; it's noted here so the scaffold doesn't paint the project into a corner.

Infrastructure already in place before this spec:
- Git flow via SourceTree — branches `main` and `develop`, plus short-lived feature branches
- Git repo initialized, connected to GitHub
- Two Supabase projects: one tracking `develop`, one tracking `main` (not wired up yet)
- Vercel project linked to the GitHub repo (not yet configured for a real app, since none exists)

## Decisions

| Area | Decision |
|---|---|
| Framework | Next.js 15, App Router, TypeScript |
| Package manager | yarn |
| Styling | styled-components (built-in nested selectors/media queries cover SCSS-like syntax), with a Next.js App Router SSR registry |
| Testing | Vitest + React Testing Library |
| Repo structure | Single flat Next.js app (no monorepo) — YAGNI until a second deployable app exists. The 3-tier dashboard is route groups + middleware inside this same app, not a separate app |
| Node version | 22 (LTS), pinned via `.nvmrc` and `package.json` engines |
| Hosting | Vercel (already linked). `main` → Production, `develop` → Preview/staging. Feature branches get Vercel's automatic ephemeral previews |
| Agent norms file | `CLAUDE.md` at repo root |
| Docs | `docs/superpowers/specs/` — this spec is committed as a historical record; `docs/` is gitignored going forward for day-to-day working docs |
| Project skills | `.claude/skills/`, created empty with a placeholder README |

## Architecture

One Next.js app at the repo root:

```
src/
  app/            # routes — home page only for this pass
  components/     # shared UI components
  lib/            # styled-components SSR registry now; future supabase/r2 clients live here later
.claude/
  skills/         # project-specific Claude Code skills, built up as features land
docs/             # gitignored (see above)
CLAUDE.md         # project norms/patterns, updated continuously
.env.example      # committed, placeholder only — documents the env vars the next pass (Supabase/R2) will fill in
.nvmrc            # Node 22
```

Path alias `@/*` → `src/*`.

Environment separation is handled entirely by Vercel's per-branch env var scoping (Production vs. Preview) — no custom env-switching code needed yet, since there's nothing to switch between until Supabase/R2 are wired.

### styled-components + App Router

Next.js Server Components can't use styled-components directly (it's a client-side CSS-in-JS library). Standard fix: a `StyledComponentsRegistry` client component (using `useServerInsertedHTML`) wrapping the root layout, so styles are correctly extracted and injected during SSR without a flash of unstyled content. This is boilerplate, not custom logic — implemented once in `lib/registry.tsx`.

## Home Page

Minimal branding placeholder — no nav, no forms, no auth gate (none exists yet):

- Centered wordmark: **HUMAN SERVICES**
- Subline: **By Human Records** (label attribution)
- Small status tag: **ACCESS BY INVITATION**
- No logo yet — a slot is left for when one is supplied

### Design direction

"Old-school internet meets sleek/sexy," leaning into the deadpan bureaucratic "public service portal" idea the name suggests, executed in a refined, modern, dark aesthetic:

- **Palette**: near-black background, off-white/paper foreground text, single accent color `#FFD000` (used sparingly — status tag, maybe the blinking cursor)
- **Type**: monospace/stamp-style font for meta/label text (e.g. "STATUS: INVITE ONLY"), paired with a clean modern serif or grotesk for the wordmark itself — the contrast between the two is the visual hook
- **Motion**: minimal — a terminal-style blinking cursor or subtle scanline/flicker on load; nothing beyond that

## Testing

One smoke test for this pass: home page renders the wordmark. Proves the Vitest/RTL harness is wired correctly; not meant to be exhaustive. Further tests are added as real features land, per project convention (noted in CLAUDE.md).

## CLAUDE.md contents (seed)

- Stack summary (Next.js/TS/styled-components/Vitest, yarn)
- Branch → environment map (`main` = production, `develop` = staging)
- Styling convention: styled-components only (no Tailwind, no CSS Modules)
- Noted future constraint: 3-tier user model (listener/artist/label member), dashboard access varies by tier — not yet implemented, but shapes future routing/auth decisions
- Docs convention: `docs/` is gitignored except specs explicitly committed as historical record
- Pointer to `.claude/skills/` for feature-specific skills
- Workflow convention: feature branches (worktrees allowed, merge back before PR) → PR into `develop` → user merges manually on GitHub; same for `develop` → `main`. CI/Copilot review to be added later. An agent never merges its own PR

## Workflow

Standing convention for this project, not just this pass:

- Work happens on feature branches, optionally in separate git worktrees (worktrees get merged back into one feature branch when the work converges)
- Feature branch → PR into `develop` (CI and Copilot review to be added later; not part of this pass)
- User manually merges the PR on GitHub — an agent never merges its own PR
- `develop → main` also goes through a PR, merged manually the same way

## Deployment Verification

1. Scaffold pushed to `feature/init-next-js`, opens a PR into `develop` (Vercel gives the PR its own ephemeral preview)
2. Merge the PR on GitHub; confirm Vercel auto-deploys `develop` to its Preview environment, serving the home page correctly
3. Open a PR from `develop` into `main`, merge on GitHub
4. Confirm Vercel Production deploy serves the home page correctly

No new Vercel configuration needed — the project is already linked to the GitHub repo; pushing commits triggers the existing pipeline.

## Explicitly Out of Scope (this pass)

- Supabase client/env wiring (either project)
- Cloudflare R2 client/credentials
- Any auth flow, invite mechanism, or role-based routing/middleware
- Dashboard UI (artist/label-member tiers)
- Logo (placeholder slot left in the home page markup/component)
