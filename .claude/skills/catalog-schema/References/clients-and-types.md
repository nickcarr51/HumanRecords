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
