---
name: admin-upload
description: Use when working on the releases model (releases table, positions, publish_release), the admin portal (`/admin`, `/admin/upload`, `/admin/releases`, `/admin/releases/[id]`), label-member access control (current_user_role, getCurrentRole, admin layout gate, navbar Admin link), the upload form (UploadForm, TrackWidget, ArtistCombobox, upload reducer/engine), presigned R2 uploads, the release admin (pin/reorder/archive, edit page, replace/add/remove track: `release-actions.ts`, `AdminReleases`), the upload side of stored waveforms (`peaksUrl`, `storePeaks` after each MP3 PUT, the Analyze all panel on the release edit page; the waveform end to end is the `waveform` skill), the invite-users script, or artist management at `/admin/artists`. (User management at `/admin/users` is the `invites` skill.)
---

# Releases + Admin Upload

A **releases** model (a release is either a single → one track, or an album → one album of
ordered tracks) that the `/feed` timeline now reads in one query, plus a label-member-only
**admin portal** (`/admin` → `/admin/upload`) where a label member publishes a single or an
album: MP3s go to R2, catalog rows go to Supabase. Publishing is create-only; managing published releases (pin, reorder, archive/restore, edit, replace MP3,
add/remove tracks) lives at `/admin/releases` (branch `feature/admin-release`, 2026-10-10; schema side:
soft delete and ordering, see [[content-lifecycle]]). Upload built on `feature/admin-release-upload` (2026-09-29/30).

## The one thing to understand first

**Publishing is two phases, and only the second touches the database.** First the browser
uploads each MP3 *directly to R2* using short-lived presigned PUT URLs minted by the
`createUploadUrls` server action (the file never passes through Next.js); after each MP3 PUT the browser also computes the track's waveform and PUTs `peaks/<id>.bin` (best-effort, `storePeaks`). Then the
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
| Feed data (releases, pinned first, then `sort_at`) | `src/lib/supabase/feed.ts` (`getFeed`) |
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
| Browser upload + publish orchestration | `src/components/Upload/upload-engine.ts` (`putFile`, `runPool`, `runPublish`; calls `storePeaks` after each MP3 PUT) |
| Waveform compute + store (admin browser only): `peaksFromChannels`, `computePeaks`, `storePeaks` (never throws); format/key `peaksKeyFor` | `src/lib/peaks/{compute,format}.ts` ([[media-storage]]) |
| Analyze waveforms: `getPeaksStatus`, `getPeaksJob` (label-member role check first) | `src/lib/admin/peaks-actions.ts` |
| "Analyze all" on `/admin/releases/[id]` (sequential, ignores late status, stops after unmount; status keyed on id + `audioKey`, so a row is re-checked after Replace MP3) | `src/components/AdminReleases/AnalyzeWaveforms.tsx` ([[waveform]]) |
| Form UI | `src/components/Upload/{UploadForm,TrackWidget,KindToggle}.tsx`, `upload.styles.ts`, `index.ts` |
| Admin pages | `src/app/(app)/admin/page.tsx`, `admin.styles.ts`, `src/app/(app)/admin/upload/page.tsx`. Each exports `metadata = { title: 'Admin · <Section>' }` (tab `Admin · Upload · Human Services`); new admin pages follow [[head-tags]] |
| "Various Artists" display | `src/components/Feed/AlbumRow.tsx`, `src/app/(app)/albums/[id]/page.tsx` |
| Copy: admin UI says "album" (`KindToggle`, `UploadForm`, release admin); listener copy says "Pack" (CLAUDE.md Vocabulary) | `src/components/Upload/KindToggle.tsx` vs `src/components/Feed/AlbumRow.tsx` |
| Release admin actions (role check first, then RPCs; `setPinned` uses the service client): `setPinned`, `moveRelease`, `archiveRelease`, `restoreRelease`, `removeTrack`, `restoreTrack`, `saveRelease`, `addAlbumTrack`, `replaceTrackAudio` | `src/lib/admin/release-actions.ts` |
| Release admin reads (`AdminTrack` carries `audioKey` = `tracks.audio_url`, which changes when the MP3 is replaced) | `src/lib/admin/releases.ts` (`getAdminReleases`, `getAdminRelease`) |
| Release admin UI | `src/components/AdminReleases/*` (`ReleasesTable`, `ArchiveControl`, `ConfirmModal`, `useAdminAction`, `uploadOne` (also calls `storePeaks`), `AnalyzeWaveforms`, `edit-reducer` incl. `draftKey`, `TrackEditor`, `ReplaceAudio`, `RemoveTrack`, `RemovedTracks`, `AddTrackForm`, `EditReleaseForm`) |
| Release admin pages | `src/app/(app)/admin/releases/page.tsx`, `src/app/(app)/admin/releases/[id]/page.tsx` |
| Artists admin: list / new / `[id]` (edit + Danger zone delete) | `src/app/(app)/admin/artists/{page,new/page,[id]/page}.tsx`, `src/components/AdminArtists/{ArtistsTable,ArtistForm,DeleteArtist}.tsx` |
| Artist actions: `createArtist`, `updateArtist`, `deleteArtist`, `searchLinkableUsers` (cookie client, so RLS applies; delete via `admin_delete_artist`; error mapping incl. 23503 on create/update = "That user no longer exists. Pick another.", `creditMessage`) | `src/lib/admin/artists-actions.ts`, `src/lib/admin/artists-types.ts` |
| Admin caller check (`activeLabelMemberId()`: label_member role AND `auth.getUser()` succeeds, so banned label members are refused at once; used by the artists and users actions) | `src/lib/admin/caller.ts` |
| Artists table phone cards (cells carry `data-label`; shared `Table` shows it as a `::before` label below `md`) | `src/components/AdminArtists/ArtistsTable.tsx`, `src/components/AdminUsers/users.styles.ts` |
| Link an artist to an account | `src/components/AdminArtists/UserCombobox.tsx` |
| Reused list search + pagination (`basePath="/admin/artists"`) | `src/components/SearchInput/`, `src/components/Pagination/` (`pageHref(basePath, query, page)`); see [[artists-read]] |
| Admin index cards (Upload, Releases, Users, Artists) | `src/app/(app)/admin/page.tsx` |
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
  PUT with signed Content-Type, the best-effort peaks PUT and Analyze all, HEAD verification,
  retry semantics, failure matrix, the R2 CORS rule.
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
- [[waveform]] — the stored-peaks system this feature writes (`storePeaks`, Analyze all) and the player reads.
- [[auth]] — session/middleware layer under the label-member gate; `getCurrentRole` and
  `requireLabelMember` live in `src/lib/auth/role.ts`.

## Known deferrals (as of 2026-10-10)

- **Release admin shipped** (2026-10-10) at `/admin/releases` and `/admin/releases/[id]`. Behaviors to keep:
  - **Hybrid save**: titles, artists and track order are one *draft* saved with `saveRelease` (`update_release`); file and lifecycle changes (replace MP3, add track, remove/restore track, archive/restore, pin, move) are *instant* actions.
  - **Dirty lock**: instant actions and the header Archive are disabled while the draft is dirty ("Save or discard your changes first."). The draft resets only when server content changes (`draftKey`), so unrelated re-renders keep unsaved edits.
  - **Draft fields lock while an instant action is in flight**: during add-track or restore the album/track fields, artists, ↑/↓, Save and Discard are disabled (`EditReleaseForm`, via `onBusyChange` on `AddTrackForm`/`RemovedTracks`/`RemoveTrack`), because success resets the draft from server content and would wipe edits typed meanwhile.
  - **Remove dialog lock**: the same lock holds for as long as a track's Remove confirm dialog is open (not only while the remove runs), so a keyboard user who tabs out of the dialog cannot edit the draft.
  - **"Saved."**: a successful draft save shows an inline `role="status"` "Saved." line; any further edit or Discard hides it.
  - **Stale-track-list refusal**: `update_release` rejects a draft whose track list no longer matches the live tracks (add/remove/restore elsewhere); the user reloads. Concurrent title/artist edits are not detected: last write wins.
  - **Replace MP3** shows a `role="status"` "MP3 replaced." line next to the control; picking another file clears it.
  - **Per-row controls** have accessible names with the title (`Pin <title>`, `Archive <title>`, `Remove <title>`, `Replace MP3 for <title>`); visible text is unchanged.
  - **Errors are inline** (`role="alert"`), not toasts (built before `ToastProvider` was mounted in `AppShell`; switching is optional).
  - Every action checks the role first, validates UUIDs and artist refs (each ref must be a UUID `id` or a non-blank string `newName`; anything else is "Invalid request." with no DB call), and for add/replace checks `AUDIO_KEY_RE` plus `headObject` before the RPC. Success revalidates `/feed`, `/admin/releases`, `/admin/releases/[id]`, `/albums/[id]`.
  - **Edit page**: a failed read shows an inline "Couldn't load this release." (unknown id → 404); "‹ releases" returns to `?archived=1` for an archived release. Tab titles: `Admin · Releases`, `Admin · Edit release`.
  - **Known gap (security review 2026-10-11, deferred)**: `add_album_track`/`replace_track_audio` accept any existing `tracks/<uuid>.mp3` key, so a hand-built server-action call by a label member could point a track at an object another track uses or one already queued in `r2_cleanup_queue`. Add a SQL guard (refuse keys referenced by `tracks.audio_url` or an uncleaned queue row) before any R2 cleanup job ships.
  - **Retry re-uploads**: retrying an add/replace after a failed action uploads a fresh object; the old one is orphaned (accepted; never delete from R2).
  - **ID3 hint**: edits don't rewrite MP3 tags; the page tells users to replace the MP3 with a re-tagged file.
  - No images in this pass.
- **Orphaned R2 objects**: a publish that fails after uploads (or a retried add/replace) leaves objects in R2 with no row pointing at them. Replaced/archived keys are queued in `r2_cleanup_queue`; the cleanup job is not built.
- **No artwork** upload this pass (`album_art_url`/`track_art_url` stay null).
- **ORM**: none. Edit/delete now exists as SQL functions + thin server actions; revisit (likely Drizzle) only if more multi-table writes appear;
  `src/lib/admin/` is the seam.
- **Production accounts** are created by hand; `scripts/invite-users.mts` is for develop.
- **R2 CORS** must be applied in Cloudflare before any real browser upload works.
- **Upload bar sits at 100% during the peaks decode (deferred, owner 2026-10-14):** `uploadDone` fires only after `storePeaks` (decode + PUT), with no "analyzing…" text, and the lane waits on the page-wide decode queue. Details and possible fixes: [[waveform]] Known gaps.

A human-oriented walkthrough (reading order, end-to-end trace, QA checklist, ops) is in
`Walkthrough/walkthrough.md` (gitignored).
