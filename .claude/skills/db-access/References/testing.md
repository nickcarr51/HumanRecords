# Reference: Testing the database access layer

## Before running

- The local stack must be up (`yarn supabase start`) with every migration applied
  (`yarn supabase migration up`).
- `.env.local` must have `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  (Vitest loads `.env*` through `loadEnv` in `vitest.config.mts`). `test-helpers.ts` throws at
  import when `DATABASE_URL` is set to any host but `127.0.0.1`/`localhost` (an unparseable URL
  counts as non-local), and the error never echoes the URL.
- Every test file added for the Drizzle layer that opens a database connection or builds a
  Drizzle instance starts with `// @vitest-environment node`. Its unit tests that do neither
  (`relations.test.ts`, `errors.test.ts`, `policy.test.ts`, `viewer.test.ts`,
  `artist-names.drizzle.test.ts`) don't; `src/app/api/health/db/route.test.ts`, which mocks
  `checkDatabase`, has it anyway. Older data tests that reach Drizzle through `getFeed`
  or `listUsers` (e.g. `feed.data.test.ts`, `src/lib/admin/artists.data.test.ts`) don't
  either, and run in jsdom (the default in
  `vitest.config.mts`), where postgres.js works too. `*.data.test.ts` files run in the serial `db`
  Vitest project ([[catalog-schema]] `References/local-workflow.md`); the others run in `unit`.

## What each test proves

Data tests (local database, real signed-in users, fixtures created and deleted by each file):

| File | Proves |
|---|---|
| `src/lib/db/db-access.data.test.ts` | `asUser` runs as `authenticated` with the caller's id; RLS hides an archived release from a listener but not a label member; only `{ sub, role }` is sent; 10s statement and lock timeouts; nothing (role, claims, timeouts) left on its one dedicated connection afterwards, also after the callback throws; a failed query's error is a `DatabaseError` with no SQL text in any nested property, keeps `params`, has no `cause`; a refused query gives `FORBIDDEN` "You don't have permission to do that.". `asSystem` runs as `postgres` with the timeouts, leaves nothing on the connection (normal and failed paths), refuses a real grant used for a different action before touching the database, and turns a failed query into a `DatabaseError` with no SQL text, its `params` kept and no `cause` |
| `src/lib/db/health.data.test.ts` | `checkDatabase` passes on a dedicated connection and through `getDb`; a refused connection gives `failed: "query"` with `Error ECONNREFUSED`; switching to `authenticator` gives `failed: "bypassesRls"` (`CheckFailed`); switching to `service_role` gives `failed: "readsAuthUsers"` and logging in as `supabase_read_only_user` gives `failed: "switchesToAuthenticated"` (both `PostgresError 42501`); a write inside its transaction fails with `25006` (read-only); a failure is described by name and code only, never the message, and a database error is `PostgresError` whatever the build named its class |
| `src/lib/services/viewer.data.test.ts` | `getViewer` reads the role from the database, not the token; a signed-out client gets `UNAUTHENTICATED` |
| `src/lib/services/policy.data.test.ts` | `authorize` with real Viewers: label member granted; listener, artist and no-role (no `public.users` row) forbidden; an issued Viewer (role, user id, claims' user id) and an issued Grant can't be changed (`TypeError`, plus `@ts-expect-error` for the type); a `{ ...viewer }` copy forbidden |
| `src/lib/services/policy-writes.data.test.ts` | the slice 2, 3 and 4 rules (`users.setRole`, `artists.delete`, `releases.archive`, `releases.restore`, `releases.move`, `releases.publish`, `releases.update`, `tracks.archive`, `tracks.restore`, `tracks.replaceAudio`, `tracks.add`) with real Viewers: label member granted (a frozen Grant for that action); listener, artist and no-role (no `public.users` row) forbidden with the rule's own message; a `{ ...viewer }` copy forbidden ("Not authorized.") |
| `src/lib/services/users.parity.data.test.ts` | `listUsers` alone (since slice 4 dropped `admin_list_users`): each kind of user (invite unused, invite used, no invite, label member, banned) gets exactly the row the SQL function returned, with the same columns and timestamps written as Supabase's API writes them, newest first; a listener gets `FORBIDDEN` |
| `src/lib/services/users-role.parity.data.test.ts` | `changeUserRole` alone (since slice 4 dropped `admin_set_user_role`): it changes another user's role; refuses your own role (`INVALID`) and leaves it, also when your own id is written in uppercase (compared case-insensitively, like the SQL function's uuid comparison); reports an unknown user (`NOT_FOUND`); refuses a listener and an artist (`FORBIDDEN`) and leaves the target's role |
| `src/lib/services/artists.parity.data.test.ts` | `removeArtist` alone (since slice 4 dropped `admin_delete_artist`): an artist with a photo is deleted and one `r2_cleanup_queue` row is queued (`archived`, `artists`); one without a photo is deleted and nothing is queued; an artist credited on a track or on an album is refused (`CONFLICT`), kept, and nothing is queued; an unknown id → `NOT_FOUND`; a listener and an artist are refused (`FORBIDDEN`) and the artist is kept |
| `src/lib/services/releases.parity.data.test.ts` | the six slice 3 release services against the SQL functions they replaced. Until slice 4 dropped those functions each scenario ran through both and saved the SQL function's outcome as a snapshot (`src/lib/services/__snapshots__/releases.parity.data.test.ts.snap`); each scenario now runs through the service only and must match it: the same error (code and message) at each step and the same rows afterwards (`releases` and `tracks` live or archived, with equal timestamps shown as equal letters, `audio_url`, and the `r2_cleanup_queue` rows, with ids and the tag replaced by labels; move scenarios record the rows after each move). Every refusal, no-op and success path: archive a single or an album (an earlier-removed track left alone; a second archive leaves the timestamps put), restore (the Monday/Tuesday case: only tracks archived with the album come back), a file already cleaned, removing the last live track and restoring the album, unknown and orphan tracks, replace (same key, archived track), `moveRelease` scenarios with tied and near-tied `sort_at` values and the pinned edge, and a listener and an artist refused with each rule's message. Never update that snapshot (`vitest -u`, or renaming a test): the SQL functions it was recorded from are gone. |
| `src/lib/services/releases-publish.parity.data.test.ts` | `publishRelease`, `updateRelease` and `addAlbumTrack` next to `publish_release`, `update_release` and `add_album_track` (still in the database until the final cleanup). 43 cases, each with a payload shape the actions let through (they refuse any other shape first). Each scenario runs twice on fresh data, once through the SQL function and once through the service, and both must give the same error at each step (code and message, SQL codes named as the services name them) and the same rows afterwards (tracks, credits, albums, positions, releases and artists, the tag replaced by `TAG`, catalog numbers compared by their order): ordered and repeated artist refs, new and existing artists, albums with and without album artists, title trimming, upper-case ids, every message a form can trigger (single/album track counts, album title, blank track title, no artists, unknown artist, archived, stale drafts), a blank title on track 2 saving nothing, unknown releases, and a listener and an artist refused |
| `src/lib/db/drop-replaced-functions.data.test.ts` | migration `20261119120000`: the 11 replaced functions are gone and the others remain; `anon` and `authenticated` have no `TRUNCATE`, `TRIGGER`, `REFERENCES` or `MAINTAIN` on any `public` table and no `UPDATE` on `users`; a table created later gives them only select, insert, update and delete; a signed-in user's update on `users` is refused while the service role still updates it |
| `src/lib/supabase/track-one-place.data.test.ts` | migration `20261115120000`: the database refuses an album track on a second album, a single's track on an album, an album track as a new single or as an existing single's track, and re-pointing an album link at a single's track (`23505` "A track can belong to only one release."); new tracks still link onto an album and as a single; `tracks.archived_with_release` is `false` on a new track |
| `src/lib/services/users-row-cap.data.test.ts` | `listUsers` applies `MAX_ROWS` (lowered to 1 by mocking `@/lib/db/max-rows`) |
| `src/lib/supabase/feed-drizzle.parity.data.test.ts` | `getFeed` search returns the releases, in the order, that the old path (`search_feed` plus the old feed's drops, dropped in slice 4) gave, written out as explicit expected ids, for tricky queries (`%`, `_`, `\`, case, archived track, album title, album-artist credit, live track), as a listener and a label member; `createdAt` is PostgREST's exact string; a page past the end has no items and the real totals; signed out → `UNAUTHENTICATED` |
| `src/lib/supabase/feed-row-cap.data.test.ts` | `getFeed` returns at most `MAX_ROWS` (lowered to 2) for page size 1500, with the exact total |
| `src/lib/supabase/albums.drizzle.data.test.ts` | `getAlbum` orders tracks and artists by position and drops archived tracks; signed out → `UNAUTHENTICATED` (written for slice 1's Drizzle `getAlbum`; runs unchanged against the supabase-js `getAlbum` since slice 2) |
| `src/lib/admin/artists-links.data.test.ts` | `getAdminArtist` and `loadLinkTargets` through the whole `getViewer` → `asUser` → `listUsers` → `asSystem` path, nothing mocked; a listener gets `FORBIDDEN` |

The older data tests (`feed.data.test.ts`, `feed-query.data.test.ts`,
`feed-after-release.data.test.ts`, `src/lib/admin/artists.data.test.ts`) run unchanged against the
Drizzle code and are the main proof that behavior didn't change; `albums.data.test.ts` runs
unchanged against the supabase-js `getAlbum`. `publish-release.data.test.ts`,
`update-release.data.test.ts` and `add-track-replace-audio.data.test.ts` (its `add_album_track`
cases; all in `src/lib/supabase/`) still test the SQL functions the final cleanup drops, with setup
through the `archiveRelease` / `archiveTrack` services. Slice 4 deleted `search-feed`,
`archive-release`, `archive-track` and `move-release` `.data.test.ts` and the tests of the dropped
functions in `invites.data.test.ts` and `artists-admin-writes.data.test.ts`; what they checked is
in the parity tests above.

Unit tests (no database):

| File | Proves |
|---|---|
| `src/lib/db/client.test.ts` | `Missing DATABASE_URL`; same instance on a second call; a malformed URL's error has no password anywhere and no `cause`; TLS off for `127.0.0.1` and `localhost`; CA-checked TLS for a hosted URL; `prepare: false`, `max: 5` and both connection timeouts for local and hosted URLs; `?sslmode=require` keeps the CA object; the embedded CA's fingerprint |
| `src/lib/db/relations.test.ts` | it finds exactly the 16 links `relations.ts` declares (update the number when a link is added or removed), and every one matches a foreign key in `generated/schema.ts` |
| `src/lib/supabase/album-request.test.ts` | the one request `getAlbum` sends (an `albums` select) doesn't ask for `track_art_url`, as before Drizzle; a stand-in client answers `getClaims` with a user id and keeps the `select()` text, so nothing connects (it replaced slice 1's `src/lib/db/album-page-query.test.ts`) |
| `src/lib/services/errors.test.ts` | each `fromPgError` rule: mapped codes and messages, code read from `cause`, `DomainError` unchanged, other codes and code-less Drizzle query errors (by class and by shape) → `DatabaseError` with no query text; only an error with the database's `severity_local` field counts, whatever its name (the stand-ins are named `o`, as in the production build), so a Node system error (`EPIPE`), a Postgres-looking code on any other error, or an error merely named `PostgresError` passes through unchanged |
| `src/lib/services/policy.test.ts` | a hand-built Viewer is refused; `asSystem` rejects a forged grant at runtime before any database access (`DATABASE_URL` stubbed empty); two compile-time checks (`@ts-expect-error`) that a hand-built `Grant` or `JwtClaims` fails typecheck |
| `src/lib/services/viewer.test.ts` | `getClaims` logs only the auth error's name and status, then throws `UNAUTHENTICATED`; on success it returns a frozen copy, not the auth library's own object (both through one stand-in client helper) |
| `src/app/api/health/db/route.test.ts` | the route is never cached; 200 `{ ok: true }`; 503 `{ ok: false }` with one log line naming the check and the error's name and code |
| `src/lib/supabase/artist-names.drizzle.test.ts` | `artistNamesOf`: position order, missing artists dropped, duplicates removed |
| `src/lib/admin/users.test.ts` | `getAdminUser` with `getViewer` and `listUsers` mocked; the Viewer from `getViewer` is the one passed to `listUsers`; `listAdminUsers` sorts A to Z by name (no name last, ties by email) whatever order `listUsers` returns |
| `src/lib/admin/release-actions.test.ts` (the eight release admin actions on services) | with `getViewer` and the release services mocked: each action passes the Viewer and its arguments to its service; `FORBIDDEN`, `INVALID`, `NOT_FOUND`, `RETRY` (in `moveRelease`) and an unknown error give the same messages as before; `RETRY` outside `moveRelease` and a throwing `getViewer` give the logged fallback (the service is not called); non-string track or album titles in `saveRelease` and a non-string title in `addAlbumTrack` are "Invalid request." with no service call ([[admin-upload]]) |
| `src/lib/admin/actions.test.ts` (`publishRelease`) | with `getViewer` and the `publishRelease` service mocked: a release shape the upload form never sends (unknown or missing kind, `album: null`, a non-string album or track title, a malformed artist ref) is "Invalid release." with no storage or service call; otherwise the action passes the Viewer and the payload; `INVALID` shows its message, `FORBIDDEN` "Only label members can do this.", a `DatabaseError` the logged "Couldn't publish. Nothing was saved — try again.", none of them redirecting ([[admin-upload]]) |
| `src/lib/admin/users-actions.test.ts` (`setUserRole`), `src/lib/admin/artists-actions.test.ts` (`deleteArtist`) | with `getViewer` and `changeUserRole` / `removeArtist` mocked: the action passes the Viewer and its arguments to the service, and each `DomainError` code (and an unexpected `DatabaseError`) becomes the same message as before; `deleteArtist` also returns the generic message, without deleting, and `setUserRole` without changing the role, when `getViewer` throws ([[invites]], [[admin-upload]]) |
| `scripts/lib/drizzle-schema.test.ts` | `yarn db:pull`'s normalize step: the local and CI pulls of 2026-10-26 (different table, entry, key-column, import and policy order) give one file; a second run changes nothing; the committed `generated/schema.ts` is already sorted and has no policy expressions; unknown shapes throw |
| `.claude/hooks/guard-db.drizzle.test.ts` | the hook asks before `drizzle-kit push/migrate/drop/up`, `drizzle-kit` with a hosted host, and any command with a hosted database URL, including passwords with a raw `@` or `/`, a space or a quote mark, and (on purpose) a local URL next to a hosted name; allows local URLs and a hosted name with no database URL |

## Running

```bash
yarn supabase start
yarn supabase migration up
yarn vitest run --project db src/lib/db src/lib/services src/lib/supabase/feed-drizzle.parity.data.test.ts src/lib/supabase/track-one-place.data.test.ts
yarn vitest run --project unit src/lib/db src/lib/services src/lib/supabase/album-request.test.ts .claude/hooks
yarn test --run          # everything
```

A connection error while the stack is down is the environment, not a regression.
