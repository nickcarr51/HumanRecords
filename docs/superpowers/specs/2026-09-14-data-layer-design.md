# Human Services — Data Layer Design

**Date:** 2026-09-14
**Status:** Approved
**Scope:** Wire up Supabase (local dev + develop + production), establish the
Auth model (invite + email OTP), and design the initial catalog schema
(profiles, artists, albums, tracks, downloads). Dashboard UI, fine-grained
write RLS policies, Cloudflare R2 client wiring, and the eventual
request/approval invite flow are explicitly out of scope for this pass.

## Context

Two Supabase projects already exist (one tracking `develop`, one tracking
`main`), created via the Supabase web dashboard, not yet wired into the
codebase. No Supabase dependency, client, or `supabase/` directory exists in
the repo yet (confirmed clean slate). Vercel is already linked to the GitHub
repo with branch-scoped env vars (Production vs. Preview) per the
[project bootstrap design](2026-09-12-project-bootstrap-design.md) — that
mechanism carries forward unchanged for Supabase keys.

This is split into two execution phases with different rigor:

- **Setup/config** (Part A below) — installing tooling, linking projects,
  configuring Auth settings, wiring client helpers. Executed as a live,
  step-by-step walkthrough (current Supabase docs pulled at execution time)
  immediately after this spec is approved. No separate implementation plan
  document — the steps here are the plan.
- **Schema** (Part B below) — the catalog data model. Goes through the full
  `writing-plans` → TDD implementation cycle after this spec is approved,
  since it's the part with real design risk (relationships, RLS, migrations).

## Decisions

| Area | Decision |
|---|---|
| Local dev stack | Supabase CLI (`supabase start`), Docker-based — local Postgres + Studio GUI + Auth |
| Environment topology | 3 environments: local (Docker), `develop` Supabase project (shared across all feature branches), `production` Supabase project. No per-feature-branch ephemeral DB branching — YAGNI for a solo/small-team MVP; can be added later without restructuring. |
| Migration source of truth | Supabase CLI migration files (`supabase/migrations/*.sql`), applied to `develop` first, then `production` on promotion (mirrors the `develop`→`main` PR flow already in place) |
| Local test data | `supabase/seed.sql`, freely editable/replaceable, reapplied via `supabase db reset` |
| Auth mechanism | Supabase Auth, Email OTP (passwordless) as the sole login method; password auth disabled |
| Invite mechanism (MVP) | No custom invite/allowlist table. Admin manually creates users (Supabase Studio or admin API "invite by email"), which sends a magic link. All subsequent logins use email OTP. Request-based approval and exclusive/multi-use invite links are explicitly deferred — noted here so the schema doesn't preclude them later. |
| Client libraries | `@supabase/supabase-js` + `@supabase/ssr`, client helpers in `src/lib/supabase/` (browser + server variants), per existing convention that `lib/` holds infra clients |
| Env vars | `.env.local` (gitignored) for local Supabase keys; Vercel per-branch env scoping continues to handle `develop`/`production` keys, unchanged from the bootstrap design |

## Part A — Setup/Config (walkthrough, no plan file)

1. Install Docker Desktop (in progress) and the Supabase CLI
2. `supabase init` in the repo; `supabase link` to both the `develop` and
   `production` projects (the CLI supports linking to one project at a time
   for push/pull — walkthrough will cover switching between them)
3. `supabase start` — brings up local Postgres, Studio (GUI), Auth, etc. in
   Docker. Studio satisfies the "I want a GUI" requirement locally.
4. Configure Auth in the Supabase dashboard (and mirror locally via
   `supabase/config.toml`): enable Email OTP, disable password auth, set
   redirect URLs and email templates for the magic-link invite email
5. Add `@supabase/supabase-js` and `@supabase/ssr` to the project; create
   `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts`
   (server components/route handlers), following current Supabase Next.js
   App Router SSR guidance
6. Create `.env.example` entries and `.env.local` for local Supabase URL/keys
7. Create `supabase/seed.sql` with a handful of sample profiles/artists/
   tracks/albums for local development

## Part B — Schema (→ implementation plan)

### Tables

| Table | Purpose | Key fields |
|---|---|---|
| `profiles` | App-facing user; 1:1 extension of `auth.users` | `id` (PK, FK→`auth.users.id`), `first_name`, `last_name`, `role` (enum: `listener`, `artist`, `label_member`), `created_at` |
| `artists` | Artist identity; exists independent of any login | `id` (PK), `name`, `bio` (nullable), `art_url` (nullable), `profile_id` (nullable FK→`profiles.id`, set once that artist has an account — **single source of truth for the profile↔artist link**), `created_at` |
| `albums` | Groups tracks | `id` (PK), `title`, `album_art_url` (nullable), `created_at` |
| `tracks` | A song | `id` (PK), `title`, `track_art_url` (nullable), `audio_url`, `play_count` (int, default 0), `created_at` |
| `track_artists` | Join: track↔artist (many-to-many, credits/collabs) | `track_id` (FK), `artist_id` (FK), composite PK |
| `album_artists` | Join: album↔artist (many-to-many, compilations) | `album_id` (FK), `artist_id` (FK), composite PK |
| `track_albums` | Join: track↔album (many-to-many — a track can be on 0, 1, or many albums) | `track_id` (FK), `album_id` (FK), composite PK |
| `downloads` | Who downloaded what, so an artist can see their download list | `user_id` (FK→`profiles.id`), `track_id` (FK→`tracks.id`), `downloaded_at`, unique on (`user_id`, `track_id`) |

### Notes

- `track_art_url`, `album_art_url`, and `audio_url` are plain `text` columns
  reserving the shape for Cloudflare R2 URLs/keys. No R2 client wiring here —
  that's a separate future feature.
- `play_count` increments via a Postgres RPC function (`increment_play_count`
  or similar) rather than a client-side read-modify-write, to avoid races.
  Plays are anonymous — no event log, no user association.
- A user *is* an artist whenever an `artists` row's `profile_id` points at
  their `profiles.id` — independent of that profile's `role` value (a
  `label_member` can also have their own artist row).

### Row Level Security

- RLS enabled on every table listed above.
- Read policy: any authenticated user can `SELECT` from every table (no
  public/anon access — being logged in at all is the invite gate for now).
- No `INSERT`/`UPDATE`/`DELETE` policies yet. Writes happen via Supabase
  Studio or a service-role script until dashboard UI defines real
  per-role write permissions. This is additive later — nothing here needs
  to be undone when write policies are designed.

## Explicitly Out of Scope (this pass)

- Cloudflare R2 client/credentials and actual file upload/storage
- Dashboard UI (artist/label-member tiers)
- Write RLS policies (insert/update/delete)
- Request-based invite approval, exclusive/multi-use magic links
- Per-feature-branch ephemeral Supabase DB branching
