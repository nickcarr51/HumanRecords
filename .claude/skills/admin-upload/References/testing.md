# Reference: Testing this feature

## What is tested

**Schema** — `src/lib/supabase/releases-schema.data.test.ts` (local Supabase): release
check constraint, one release per track, cascade on track delete, readable by signed-in
users; case/space-insensitive artist uniqueness; `position` required on link rows;
`current_user_role()` returns the caller's own role and isn't executable by anon.

**`publish_release`** — `src/lib/supabase/publish-release.data.test.ts` (local Supabase):
single with ordered artists + new artist creation; album with track order and album
artists; case-insensitive reuse and one row for a repeated new name; album with no album
artists; listener/artist refused with `42501` and nothing written; a later invalid track
rolls back everything.

**Feed / album** — `feed.data.test.ts`, `albums.data.test.ts` (local Supabase): releases
newest first with tracks + credits in position order; tracks without a release excluded;
uncredited single → `artistNames: []`; pagination with `hasMore`; album tracks by position
not title. The feed tests give `releases.created_at` values that **contradict** track
creation order, so they'd fail if ordering came from `tracks.created_at`.
`artist-names.test.ts` (unit): `byPosition`, `namesFrom`, `albumArtistLabel`.
`artists.data.test.ts` / `catalog-relations.test.ts` were only updated to pass `position`.

**Access control** — `src/lib/auth/role.test.ts` (getCurrentRole: value, null on error, null
on throw; requireLabelMember: resolves for label_member, `notFound` for listener/artist/null),
`src/app/(app)/admin/layout.test.tsx` (wiring; `requireLabelMember` is mocked),
`admin/page.test.tsx` + `admin/upload/page.test.tsx` (each page gates itself),
`route-guard.test.ts` (`/admin` protected), `AppShell.test.tsx` (Admin link only for label
members).

**Storage** — `src/lib/storage/sign.test.ts`: 15-min PUT URL with `content-type` in
`X-Amz-SignedHeaders`; `headObject` size / null on 404 / throw on other errors.

**Server actions** — `src/lib/admin/actions.test.ts` (R2 + Supabase mocked): role gate on
all three; search escaping/order/cap, error logging, non-string/blank queries; key minting,
invalid files, empty/oversized requests; publish happy path (HEAD → rpc → revalidate →
redirect), unminted keys, missing/oversized/zero-byte uploads, malformed payloads touch
nothing, SQLSTATE mapping without redirect. `rules.test.ts`: `audioFileError`,
`AUDIO_KEY_RE`.

**Form logic** — `upload-reducer.test.ts` (toggle rules, tracks, auto-title, file reset,
chips, pending artists, publishing flags, validate, buildPayload),
`artist-options.test.ts` (`buildOptions`), `ArtistCombobox.test.tsx` (debounce, click/keyboard
picks, Backspace, chip controls, stale response, highlight reset, Enter after Esc, search
error/rejection status, results cleared on query change), `upload-engine.test.ts` (`runPool`
concurrency/stop/falsy failure; `runPublish` invalid, double-click, happy path, retry only
missing, upload failure, action errors, rejected calls, redirect rethrow, mismatched
targets), `UploadForm.test.tsx` (initial single, album fields, toggle confirm, empty publish
errors, auto-title + wav error, Clear all, Cancel confirm, form locked while publishing).

## Running

- Unit only (no DB): `yarn test --run src/components/Upload src/lib/admin src/lib/auth src/lib/storage src/app src/components/AppShell`
- DB tests: `yarn supabase start` first, then
  `yarn test --run src/lib/supabase`
  (`test-helpers.ts` refuses non-local URLs).
- Everything: `yarn test --run`; also `yarn lint` and `yarn build`. (A pre-existing
  `tsc --noEmit` error in `src/lib/auth/actions.test.ts` is not a build failure; Next's
  build excludes tests.)

## Deliberately not tested

- Render tests for dashboard/page layout and styling (same scope as the timeline branch).
- A real browser PUT to R2 and real OTP sign-in — covered by the manual smoke below.
- `scripts/invite-users.mts` (run by hand; only the "ok" path was exercised locally).
- Known gaps (deferred): `beforeunload`, the `inFlight` double-click ref, and rejected
  `runPublish` propagation in `UploadForm`; no test that `authenticated` can't insert into
  `releases`; no `toFeedItem` null-branch test.

## Manual smoke (local) — needs the R2 CORS rule applied first

1. `yarn supabase migration up && yarn dev`
2. Sign in as `listener@example.com` (OTP from Mailpit `http://127.0.0.1:54324`): no Admin
   link; visiting `/admin/upload` lands on `/feed`.
3. Sign out; sign in as `label@example.com`: Admin link → `/admin` → Upload a release.
4. Publish a **single**: pick an MP3, pick existing artist "Daye" + create a new artist.
   Progress fills, redirect to `/feed`, the single is the top row and plays.
5. Publish an **album**: 2 tracks, reorder with ↑/↓, create the same new artist in both
   tracks (the second should be offered from the dropdown), leave album artists empty. Feed
   shows the album first with "Various Artists" and your track order; `/albums/[id]` matches.
6. The seeded "The Breaks" and "LET EM KNOW" still show, and the player keeps playing across
   `/feed` ↔ `/admin`.

A PUT failing with CORS or `SignatureDoesNotMatch` → check the bucket CORS rule and that
the request's `Content-Type` is `audio/mpeg`.
