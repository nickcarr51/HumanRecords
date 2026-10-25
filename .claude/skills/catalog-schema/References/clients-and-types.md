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
Drizzle's `DATABASE_URL` is server-only too ([[db-access]] `References/guard-rails.md`).

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
signed-in test client, against real Postgres. Since Drizzle slice 1, `getFeed` and `getAlbum` use
that client only to verify the session (`getClaims`); their queries go through Drizzle
(`asUser`, [[db-access]]). Other conventions in these modules:

- supabase-js reads throw the returned `error` (the route `error.tsx` boundary catches it); Drizzle
  reads throw the safe error `asUser`/`asSystem` produce (`DomainError` or `DatabaseError`). Return
  `null` for not-found.
- Guard id params with a UUID regex and return `null` for non-UUIDs — otherwise Postgres raises
  "invalid input syntax for type uuid" → 500.
- Escape user text before `ilike` with `escapeLike` (`src/lib/supabase/artists.ts`).
- Return camelCase view types (`albumArtUrl`, `artistNames`). supabase-js rows are snake_case and
  are mapped at the boundary; Drizzle rows already use the camelCase names of
  `src/lib/db/generated/schema.ts`.

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
(`albums.ts`), and the Drizzle reads behind `getFeed` / `getAlbum` (`TRACK_WITH` and the album
`columns` in `catalog-selects.ts` / `feed.ts` / `albums.ts`) select `catalog_number` explicitly.
That is why a database without the migration breaks those pages with Postgres error `42703` — see
[local-workflow.md](local-workflow.md). Formatting to `HS###`/`HSS###` happens only in
`src/components/CatalogId/CatalogId.tsx`; never add a formatted string column.

## Drizzle (since slice 1, 2026-10)

Rule (owner's): a read or write on one table stays supabase-js; more than one table goes through
Drizzle. Drizzle sits next to supabase-js, not instead of it. The full guide is the
[[db-access]] skill; the short version:

- `getDb()` (`src/lib/db/client.ts`) connects with `DATABASE_URL` (server-only; local stack URL in
  `.env.local`, each hosted project's transaction pooler URL in Vercel). Only `src/lib/db` may
  import it or a database driver (lint).
- Every query runs in `asUser(claims, fn)` (as the signed-in user, so RLS applies) or
  `asSystem(grant, action, fn)` (admin access with RLS skipped, only with a `Grant` from
  `authorize(viewer, action)`, only from `src/lib/services`). Both first set 10s timeouts for the
  transaction only (`prepareTransaction`).
- Both pass every error through `fromPgError` (`src/lib/services/errors.ts`): a mapped Postgres
  code (`42501`, `22023`, `P0002`, `40P01`, `23503`) becomes a `DomainError` with a fixed message,
  any other database error a `DatabaseError` ("Database query failed", code and values only,
  never the SQL text). Details: [[db-access]] `References/errors-and-health.md`.
- Callers so far:
  - through `asUser`: `getFeed` with `searchMatches` (`src/lib/supabase/feed.ts`,
    `feed-search.ts`), `getAlbum` (`albums.ts`), and `getViewer` (`src/lib/services/viewer.ts`,
    the caller's role from `current_user_role()`);
  - through `asSystem`: `listUsers` (`src/lib/services/users.ts`), called by `listAdminUsers` and
    `getAdminUser` (`src/lib/admin/users.ts`) and by `linkedUsersFor` (`src/lib/admin/artists.ts`).
  - Shared query shapes are in `catalog-selects.ts` (`ARTIST_NAMES`, `TRACK_WITH`, `toFeedTrack`);
    the artist-name mapper `artistNamesOf` is in `artist-names.ts`.
- After every migration, run `yarn db:pull` (local stack only) next to the `database.types.ts`
  regeneration above, and commit `src/lib/db/generated/schema.ts`; CI diffs both.
- A Drizzle nested read (`tx.query.*`) reads every column of a table it joins one-to-one, so
  revoking a column from `authenticated` breaks `asUser` reads with "permission denied"; change a
  grant only together with the matching Drizzle query.
- Not moved yet: several supabase-js reads still embed more than one table; each has an assigned
  slice ([[db-access]] `References/slices.md`).
