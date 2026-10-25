# Reference: Supabase clients + generated types

## Which client

| Factory | File | Use in | Key | Notes |
|---|---|---|---|---|
| `createClient()` (browser) | `src/lib/supabase/client.ts` | Client Components | publishable | Not currently used by app code — reads happen server-side. |
| `await createClient()` (server) | `src/lib/supabase/server.ts` | Server Components, Route Handlers, Server Actions | publishable + session cookies | Acts as the signed-in user, so RLS applies. **Async** (awaits `cookies()`). Create per call; never store in a module global. `setAll` swallows the error thrown when called from a Server Component (cookies are read-only there; middleware refreshes them). |
| `createServiceClient()` | `src/lib/supabase/service.ts` | Server-only code, after an explicit session check | `SUPABASE_SECRET_KEY` | Bypasses RLS + column grants. `import "server-only"` makes a client import a build error. Use only for writes with no user-scoped policy. |
| `updateSession(request)` | `src/lib/supabase/middleware.ts` | `src/middleware.ts` only | publishable | Refreshes the session cookie each request and applies the route guard ([[auth]]). |

Env vars (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(browser-safe), `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (server-only; never `NEXT_PUBLIC_`).

## Data-function convention (dependency injection)

Query modules (`feed.ts`, `albums.ts`, `artists.ts`) export functions that take
`supabase: SupabaseClient<Database>` as the **first argument** and never create a client
themselves:

```ts
// page.tsx (server)
const supabase = await createClient();
const page = await getFeed(supabase, { page: 1 });
```

Why: the same function runs in a page with the cookie client and in a `*.data.test.ts` with a
signed-in test client, against real Postgres. Other conventions in these modules:

- Throw on a Supabase `error` (the route `error.tsx` boundary catches it); return `null` for
  not-found.
- Guard id params with a UUID regex and return `null` for non-UUIDs — otherwise Postgres raises
  "invalid input syntax for type uuid" → 500.
- Escape user text before `ilike` with `escapeLike` (`src/lib/supabase/artists.ts`).
- Map snake_case rows to camelCase view types (`albumArtUrl`, `artistNames`) at the boundary.

## Generated types

`src/lib/supabase/database.types.ts` is generated — don't hand-edit. After any migration:

```bash
yarn supabase migration up      # keeps data; db reset wipes local data — avoid
yarn -s supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

The `-s` keeps yarn's banner out of the file. Commit the regenerated file with the
migration. Handy aliases: `Database['public']['Enums']['user_role']` (see `UserRole` in
`src/lib/auth/role.ts`), `Tables['tracks']['Row']`.

Note: `test-helpers.ts` clients are untyped `SupabaseClient` (no `<Database>`), so tests can
insert fixtures freely.

### Identity columns in the generated types

For a `generated always as identity` column (`albums.catalog_number`, `tracks.catalog_number`),
`supabase gen types` emits:

```ts
Row:    { catalog_number: number; … }
Insert: { catalog_number?: never; … }
Update: { catalog_number?: never; … }
```

So a typed client can read the number but any attempt to insert or update it is a compile error —
mirroring Postgres, which rejects the write at runtime (`428C9`; and the `keep_catalog_number`
trigger, see [functions.md](functions.md)). The app view types follow the Row shape:
`catalogNumber: number` is **required** on `FeedItem`/`FeedTrack` (`feed.ts`) and `AlbumDetail`
(`albums.ts`), and `RELEASE_SELECT` / `getAlbum` select `catalog_number` explicitly. That is
why a database without the migration breaks those pages with `42703 column tracks_1.catalog_number
does not exist` — see [local-workflow.md](local-workflow.md). Formatting to `HS###`/`HSS###`
happens only in `src/components/CatalogId/CatalogId.tsx`; never add a formatted string column.

## Drizzle (slice 1, 2026-10)

Rule: a read or write on one table stays supabase-js; more than one table goes through Drizzle.
Drizzle sits next to supabase-js, not instead of it.

- `getDb()` (`src/lib/db/client.ts`): lazy postgres.js + Drizzle over `DATABASE_URL` (transaction
  pooler, port 6543; `prepare: false`, `max: 5`). Throws "Missing DATABASE_URL" on first use, so
  `yarn build` and pages that never touch it work with the variable unset. Never import it outside
  `src/lib/db` (lint, below).
- Two doors, both in one transaction that calls `applyTimeouts` first (`set local statement_timeout`
  and `lock_timeout`, both `'10s'`; 10s is the owner's choice, PostgREST uses 8s and a raw Drizzle
  connection has neither):
  - `asUser(claims, fn)` (`db/user.ts`, Door 1): RLS on. Sets `request.jwt.claims` and
    `set local role authenticated`, the same identity PostgREST uses.
  - `asSystem(grant, fn)` (`db/system.ts`, Door 2): RLS off, like a security definer function. It is
    `async` and rejects with `DomainError("FORBIDDEN")` for any `Grant` that `authorize()` did not
    issue (module-private `WeakSet`; `isIssuedGrant` is exported from `policy.ts`).
- `src/lib/services/`: `authorize(viewer, action)` in `policy.ts` returns the `Grant` or throws
  `FORBIDDEN`; `errors.ts` has `DomainError` and `fromPgError` (maps the SQLSTATEs the SQL functions
  raise); `users.ts` is the first service (`listUsers`, replacing `admin_list_users`).
- `getViewer(supabase)` (`services/viewer.ts`): `{ userId, role, claims }`. Role is read from the DB
  (`current_user_role()`), not the JWT, because `admin_set_user_role` does not update `app_metadata`.
  `JwtClaims` is a branded type: only `getClaims()` (which verifies the signature) produces one, so a
  hand-built object fails typecheck.
- `yarn db:pull` (local stack only; `drizzle.config.ts` hardcodes `127.0.0.1:54322` and never reads
  `DATABASE_URL`): runs `drizzle-kit pull` and copies only `schema.ts` into `src/lib/db/generated/`.
  Never hand-edit `generated/` (eslint ignores it); CI re-pulls and diffs it. Re-run after every
  migration, next to the `database.types.ts` regeneration.
- `src/lib/db/relations.ts` is hand-written because the pulled `relations.ts` does not compile
  (hence only `schema.ts` is copied).
- `auth.users` is declared by hand in `db/auth-schema.ts` (the pull is limited to `public`). Always
  alias it, `alias(authUsers, "auth_users")`: unaliased, Drizzle renders `public.users` and
  `auth.users` both as `"users"` and Postgres fails with "table reference is ambiguous". Read it
  through Door 2 only.
- `pgrstTs(col)` (`db/timestamps.ts`): selects a timestamptz as `to_json(col) #>> '{}'` so strings are
  byte-identical to what PostgREST returned. Use it for every timestamp a Drizzle read returns.
- Lint (`eslint.config.mjs`): outside `src/lib/db` and `src/lib/services`, importing `db/client`
  (type imports allowed) or `db/system` is an error. Inside `services`, `db/client` is still banned;
  go through `asUser`/`asSystem`.
- Callers so far: `getFeed`/`searchMatches` (`supabase/feed.ts`, `feed-search.ts`) and `getAlbum`
  (`albums.ts`) via Door 1, `listUsers` via Door 2. Shared select fragments live in
  `catalog-selects.ts` and `artist-names.ts`.
- For slice 2 (writes): PostgREST sessions load `safeupdate` (blocks `UPDATE`/`DELETE` without
  `WHERE`) and Drizzle connections do not, so write paths must not rely on it.
- Env: `DATABASE_URL` is server-only; see release-ops `References/environments.md` for the per-env
  values. The CI `test` job sets it from `DB_URL`.
