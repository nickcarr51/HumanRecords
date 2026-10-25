# Reference: Testing the database access layer

## Before running

- The local stack must be up (`yarn supabase start`) with every migration applied
  (`yarn supabase migration up`).
- `.env.local` must have `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  (Vitest loads `.env*` through `loadEnv` in `vitest.config.mts`). `test-helpers.ts` throws at
  import when `DATABASE_URL` is set to any host but `127.0.0.1`/`localhost` (an unparseable URL
  counts as non-local), and the error never echoes the URL.
- Every Drizzle test file starts with `// @vitest-environment node` (postgres.js needs Node, not
  jsdom). `*.data.test.ts` files run in the serial `db` Vitest project ([[catalog-schema]]
  `References/local-workflow.md`); the others run in `unit`.

## What each test proves

Data tests (local database, real signed-in users, fixtures created and deleted by each file):

| File | Proves |
|---|---|
| `src/lib/db/db-access.data.test.ts` | `asUser` runs as `authenticated` with the caller's id; RLS hides an archived release from a listener but not a label member; only `{ sub, role }` is sent; 10s statement and lock timeouts; nothing (role, claims, timeouts) left on its one dedicated connection afterwards, also after the callback throws; a failed query's error is a `DatabaseError` with no SQL text in any nested property, keeps `params`, has no `cause`; a refused query gives `FORBIDDEN` "You don't have permission to do that.". `asSystem` runs as `postgres` with the timeouts, leaves nothing on the connection (normal and failed paths), and refuses a real grant used for a different action before touching the database |
| `src/lib/db/health.data.test.ts` | `checkDatabase` passes on a dedicated connection and through `getDb`; a refused connection gives `failed: "query"`; logging in as `authenticator` gives `failed: "bypassesRls"` |
| `src/lib/services/viewer.data.test.ts` | `getViewer` reads the role from the database, not the token; a signed-out client gets `UNAUTHENTICATED` |
| `src/lib/services/policy.data.test.ts` | `authorize` with real Viewers: label member granted; listener, artist and no-role (no `public.users` row) forbidden; a `{ ...viewer }` copy forbidden |
| `src/lib/services/users.parity.data.test.ts` | `listUsers` returns the same rows as the `admin_list_users` SQL function, byte for byte, newest first; a listener gets `FORBIDDEN` where the SQL function raises `42501` |
| `src/lib/services/users-row-cap.data.test.ts` | `listUsers` applies `MAX_ROWS` (lowered to 1 by mocking `@/lib/db/max-rows`) |
| `src/lib/supabase/feed-drizzle.parity.data.test.ts` | `getFeed` search matches the same releases in the same order as the old path (`search_feed` plus the old feed's drops) for tricky queries (`%`, `_`, `\`, case, archived track, album title, album-artist credit, live track), as a listener and a label member; `createdAt` is PostgREST's exact string; a page past the end has no items and the real totals; signed out → `UNAUTHENTICATED` |
| `src/lib/supabase/feed-row-cap.data.test.ts` | `getFeed` returns at most `MAX_ROWS` (lowered to 2) for page size 1500, with the exact total |
| `src/lib/supabase/albums.drizzle.data.test.ts` | `getAlbum` orders tracks and artists by position and drops archived tracks; signed out → `UNAUTHENTICATED` |
| `src/lib/admin/artists-links.data.test.ts` | `getAdminArtist` and `loadLinkTargets` through the whole `getViewer` → `asUser` → `listUsers` → `asSystem` path, nothing mocked; a listener gets `FORBIDDEN` |

The older data tests (`feed.data.test.ts`, `feed-query.data.test.ts`,
`feed-after-release.data.test.ts`, `albums.data.test.ts`, `src/lib/admin/artists.data.test.ts`)
run unchanged against the Drizzle code and are the main proof that behavior didn't change.
`search-feed.data.test.ts` and `invites.data.test.ts` still test the two SQL functions directly;
the parity tests use them as the reference.

Unit tests (no database):

| File | Proves |
|---|---|
| `src/lib/db/client.test.ts` | `Missing DATABASE_URL`; same instance on a second call; a malformed URL's error has no password anywhere and no `cause`; TLS off for `127.0.0.1` and `localhost`; CA-checked TLS for a hosted URL; `prepare: false`, `max: 5` and both connection timeouts for local and hosted URLs; `?sslmode=require` keeps the CA object; the embedded CA's fingerprint |
| `src/lib/db/relations.test.ts` | every link in `relations.ts` matches a foreign key in `generated/schema.ts` |
| `src/lib/services/errors.test.ts` | each `fromPgError` rule: mapped codes and messages, code read from `cause`, `DomainError` unchanged, other codes and code-less Drizzle query errors (by class and by shape) → `DatabaseError` with no query text |
| `src/lib/services/policy.test.ts` | a hand-built Viewer is refused; `asSystem` rejects a forged grant at runtime before any database access (`DATABASE_URL` stubbed empty); two compile-time checks (`@ts-expect-error`) that a hand-built `Grant` or `JwtClaims` fails typecheck |
| `src/lib/services/viewer.test.ts` | `getClaims` logs only the auth error's name and status, then throws `UNAUTHENTICATED` |
| `src/app/api/health/db/route.test.ts` | the route is never cached; 200 `{ ok: true }`; 503 `{ ok: false }` with one log line |
| `src/lib/supabase/artist-names.drizzle.test.ts` | `artistNamesOf`: position order, missing artists dropped, duplicates removed |
| `src/lib/admin/users.test.ts` | `getAdminUser` with `getViewer` and `listUsers` mocked; the Viewer from `getViewer` is the one passed to `listUsers` |
| `.claude/hooks/guard-db.drizzle.test.ts` | the hook asks before `drizzle-kit push/migrate/drop/up`, `drizzle-kit` with a hosted host, and any command with a hosted database URL; allows local ones |

## Running

```bash
yarn supabase start
yarn supabase migration up
yarn vitest run --project db src/lib/db src/lib/services src/lib/supabase/feed-drizzle.parity.data.test.ts
yarn vitest run --project unit src/lib/db src/lib/services .claude/hooks
yarn test --run          # everything
```

A connection error while the stack is down is the environment, not a regression.
