---
name: admin-upload
description: Use when working on the releases model (releases table, positions, publish_release), the admin portal (`/admin`, `/admin/upload`), label-member access control (current_user_role, getCurrentRole, admin layout gate, navbar Admin link), the upload form (UploadForm, TrackWidget, ArtistCombobox, upload reducer/engine), presigned R2 uploads, or the invite-users script. (User management at `/admin/users` is the `invites` skill.)
---

# Releases + Admin Upload

A **releases** model (a release is either a single → one track, or an album → one album of
ordered tracks) that the `/feed` timeline now reads in one query, plus a label-member-only
**admin portal** (`/admin` → `/admin/upload`) where a label member publishes a single or an
album: MP3s go to R2, catalog rows go to Supabase. Create only — edit/delete is the next
branch (schema side: soft delete and ordering, see [[content-lifecycle]]). Built on branch `feature/admin-release-upload` (2026-09-29/30).

## The one thing to understand first

**Publishing is two phases, and only the second touches the database.** First the browser
uploads each MP3 *directly to R2* using short-lived presigned PUT URLs minted by the
`createUploadUrls` server action (the file never passes through Next.js). Then the
`publishRelease` server action HEAD-checks every uploaded object and calls one Postgres
function, `publish_release(payload jsonb)`, which writes artists, tracks, credits, album,
and the `releases` row **in a single transaction** — all or nothing. The typed
`ReleasePayload` (`src/lib/admin/types.ts`) is the contract between the form and that
function, and the edit flow will reuse it. A failed publish leaves the DB untouched, but
files already uploaded stay in R2 (orphans; accepted for now).

## Pieces

| Concern | Where |
|---|---|
| Releases table, positions, unique artist names, backfill, `current_user_role()` | `supabase/migrations/20260929120000_create_releases.sql` |
| `resolve_artist_refs()` + `publish_release()` (the one write path) | `supabase/migrations/20260929120100_publish_release.sql` |
| Local seed: positions, 2 releases, real test accounts | `supabase/seed.sql` |
| Generated DB types (releases, position columns, RPCs) | `src/lib/supabase/database.types.ts` |
| Position ordering, name flattening, "Various Artists" | `src/lib/supabase/artist-names.ts` |
| Feed data (releases, newest first) | `src/lib/supabase/feed.ts` (`getFeed`) |
| Album detail, tracks in position order | `src/lib/supabase/albums.ts` (`getAlbum`) |
| LIKE-escaping shared with artist search | `src/lib/supabase/artists.ts` (`escapeLike`) |
| Role helper + page-level gate | `src/lib/auth/role.ts` (`getCurrentRole`, `requireLabelMember`) |
| Signed-out → `/login` for `/admin` | `src/lib/auth/route-guard.ts` |
| Navbar Admin link | `src/app/(app)/layout.tsx` → `src/components/AppShell/AppShell.tsx` |
| `/admin/**` gate | `src/app/(app)/admin/layout.tsx` |
| Presigned PUT + object HEAD | `src/lib/storage/sign.ts` (`signUploadUrl`, `headObject`) |
| Client-safe payload/result types | `src/lib/admin/types.ts` |
| Client-safe limits + `audioFileError` + `AUDIO_KEY_RE` | `src/lib/admin/rules.ts` |
| Server actions: `searchArtists`, `createUploadUrls`, `publishRelease` | `src/lib/admin/actions.ts` |
| Form state, reducer, validation, payload builder | `src/components/Upload/upload-reducer.ts` |
| Combobox dropdown contents | `src/components/Upload/artist-options.ts` (`buildOptions`) |
| Artist chip combobox | `src/components/Upload/ArtistCombobox.tsx` |
| Browser upload + publish orchestration | `src/components/Upload/upload-engine.ts` (`putFile`, `runPool`, `runPublish`) |
| Form UI | `src/components/Upload/{UploadForm,TrackWidget,KindToggle}.tsx`, `upload.styles.ts`, `index.ts` |
| Admin pages | `src/app/(app)/admin/page.tsx`, `admin.styles.ts`, `src/app/(app)/admin/upload/page.tsx` |
| "Various Artists" display | `src/components/Feed/AlbumRow.tsx`, `src/app/(app)/albums/[id]/page.tsx` |
| Users page + actions (each action re-checks role) | `src/app/(app)/admin/users/page.tsx`, `src/lib/admin/users-actions.ts` — see [[invites]] |
| Hosted test accounts | `scripts/invite-users.mts` (env documented in `.env.example`) |

## References

- [releases-model.md](References/releases-model.md) — schema, `publish_release` step by
  step, payload shape, SQLSTATE → UI message mapping, how `getFeed`/`getAlbum` read it,
  the "Various Artists" rule.
- [access-control.md](References/access-control.md) — the four layers (middleware, admin
  layout + page gates → 404 bounce, per-action role check, DB check), `current_user_role()`,
  the navbar link.
- [upload-flow.md](References/upload-flow.md) — the Publish sequence, key format, presigned
  PUT with signed Content-Type, HEAD verification, retry semantics, failure matrix, the R2
  CORS rule.
- [upload-form.md](References/upload-form.md) — reducer state/actions, kind toggle, chip
  identity, pending new artists, combobox debounce/stale guard/keyboard, validation messages.
- [testing.md](References/testing.md) — which tests cover what, how to run them, what is
  not tested, the manual smoke script.

## Depends on

- [[timeline-player]] — `/feed` and `/albums/[id]` render what this feature publishes; the
  admin pages live in the `(app)` group so the persistent player keeps playing.
- [[media-storage]] — R2 config and the signing helpers in `src/lib/storage/sign.ts`;
  this feature adds the PUT signer and HEAD.
- [[catalog-schema]] — `artists`/`tracks`/`albums` and the link tables that
  `publish_release` writes; RLS "authenticated can read" policies.
- [[component-library]] — `Button`, `Input`, `FormField`, `Alert`, `Heading`, theme tokens.
- [[content-lifecycle]] — `archived_at`, `pinned`/`sort_at`, `move_release`, `r2_cleanup_queue` on the rows this feature creates.
- [[invites]] — `/admin/users`; its page and actions follow the same gates.
- [[auth]] — session/middleware layer under the label-member gate; `getCurrentRole` and
  `requireLabelMember` live in `src/lib/auth/role.ts`.

## Known deferrals (as of 2026-09-30)

- **Edit/delete** ships next branch, reusing `ReleasePayload` and the form. The schema is ready (`archived_at`, `move_release`; [[content-lifecycle]]); the UI is not.
- **Orphaned R2 objects**: a publish that fails after uploads (or a file replaced after it
  uploaded) leaves objects in R2 with no row pointing at them. Cleanup lands with Delete.
- **No artwork** upload this pass (`album_art_url`/`track_art_url` stay null).
- **ORM**: none. Revisit (likely Drizzle) when edit/delete adds more multi-table writes;
  `src/lib/admin/` is the seam.
- **Production accounts** are created by hand; `scripts/invite-users.mts` is for develop.
- **R2 CORS** must be applied in Cloudflare before any real browser upload works.

A human-oriented walkthrough (reading order, end-to-end trace, QA checklist, ops) is in
`Walkthrough/walkthrough.md` (gitignored).
