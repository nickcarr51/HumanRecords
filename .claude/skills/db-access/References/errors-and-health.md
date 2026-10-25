# Reference: Errors and the database health check

## Error types (`src/lib/services/errors.ts`)

- **`DomainError(code, message)`** — a known problem. `code` is one of `UNAUTHENTICATED`,
  `FORBIDDEN`, `INVALID`, `NOT_FOUND`, `RETRY`, `CONFLICT`. The message is always written by us,
  never the database's own text, so it is safe to show a user.
- **`DatabaseError`** — any other database failure. `message` is always `"Database query
  failed"`, `name` is `"DatabaseError"`, `code` is Postgres's five-character error code when there
  is one (e.g. `57014`, a query that ran past the 10s timeout; `undefined` when the connection
  dropped mid-query) and `params` holds the values sent with the query. It never holds the SQL
  text and has no `cause` (Drizzle's original error message contains the full query).

## `fromPgError(e)` — the one place a database error becomes a safe error

`asUser` and `asSystem` wrap their whole transaction (begin, setup statement, your `fn`, commit)
and rethrow every error through it:

- A `DomainError` comes back unchanged (e.g. `UNAUTHENTICATED`, or a `FORBIDDEN` from your own
  service code).
- A database error becomes a `DomainError` with a fixed message when its Postgres code has a plain
  meaning, and a `DatabaseError` otherwise. "Database error" means: the database's own error
  report, which postgres.js raises as a `PostgresError` with a Postgres code (five digits or capital
  letters), as the error or as its `cause` (Drizzle wraps the driver's error), **or** any Drizzle
  query error even without a code (`DrizzleQueryError`, matched by class or by its shape: a string
  `query` plus `params`), because its message holds the SQL text.
  A `PostgresError` is recognised by its `severity_local` field (Postgres's "S" field, which it
  always sends), never by its class or name: the production build renames the class, so its name
  there is a short made-up one (`o` in the current build).
- Anything else (not from the database, no Drizzle query attached) comes back unchanged. That
  includes a network failure before the first query (refused, timed out, or a certificate that
  doesn't chain), which arrives as the driver's or Node's own error (its `code` is something like
  `ECONNREFUSED`, not a Postgres code), and a Node system error whose code happens to be five
  capital letters (`EPIPE`, `EPERM`). A login the database itself refuses (e.g. `28P01`, wrong
  password) is a `PostgresError`, so it becomes a `DatabaseError`.

| Postgres code | Becomes | Message |
|---|---|---|
| `42501` | `FORBIDDEN` | "You don't have permission to do that." |
| `22023` | `INVALID` | "That request isn't valid." |
| `P0002` | `NOT_FOUND` | "That item doesn't exist." |
| `40P01` (deadlock) | `RETRY` | "The database was busy; please try again." |
| `23503` (another row still points at this one) | `CONFLICT` | "That item is still in use." |
| any other code, or none on a Drizzle query error | `DatabaseError` | "Database query failed" |

`42501`, `22023` and `P0002` are what our SQL functions raise; the slice 2+ writes inherit the
mapping. Callers on the current read paths don't look at codes: the feed server actions show
"Could not load more tracks.", `/admin/users` "Couldn't load users.", `/admin/artists` "Couldn't
load artists.", and pages without a `try` reach the `(app)/error.tsx` boundary. Errors thrown while
a page renders also go to Sentry (`onRequestError` in `src/instrumentation.ts`), which is why the
message must never hold SQL.

## What an error means

| You see | Cause | Fix |
|---|---|---|
| `Missing DATABASE_URL` | Not set where the code runs | Local: add it to `.env.local` ([guard-rails.md](guard-rails.md)). Vercel: the owner adds it per environment |
| `DATABASE_URL is not a valid URL` | The value doesn't parse (often an un-encoded `@`, `#` or `/` in the password) | Re-copy the string; percent-encode the password |
| `ECONNREFUSED` / connect timeout (10s) | Local stack down, or wrong host/port | `yarn supabase start`; hosted uses the transaction pooler, port 6543 |
| A certificate error from Node (TLS) | The server's certificate doesn't chain to the embedded Supabase Root 2021 CA, or the CA expired (2031-04-26) | Get Supabase's current root CA certificate and update `src/lib/db/supabase-ca.ts` and its fingerprint test in `client.test.ts`. Never set `rejectUnauthorized: false` |
| `UNAUTHENTICATED` "Sign in to continue." | No verified session (`getClaims`) | Expected for signed-out callers; the middleware usually redirects first |
| `FORBIDDEN` "Not authorized." | A Viewer not from `getViewer`, a Grant not from `authorize`, or a Grant for another action | Pass the real objects through; use the matching `Action` |
| `FORBIDDEN` "Only label members can list users." | The `users.list` rule refused the viewer | Expected for non-label-members |
| `FORBIDDEN` "You don't have permission to do that." | Postgres `42501`: RLS or a grant refused the query (e.g. an `asUser` read of `auth.users`, or a column revoked from `authenticated`) | Use `asSystem` behind `authorize`, or fix the grant together with the query |
| `DatabaseError` code `57014` | The 10s statement timeout | Make the query cheaper; don't raise the timeout without the owner |
| `table reference "users" is ambiguous` (seen as a `DatabaseError`, code `42P09`) | `auth.users` joined without the alias | `alias(authUsers, "auth_users")` |

## Health check (`src/lib/db/health.ts`, `GET /api/health/db`)

`checkDatabase(db?)` runs these checks in order in ONE read-only transaction (`accessMode: "read
only"`, so the database refuses any write), after `prepareTransaction` (timeouts only), and stops at
the first failure:

| Check | SQL | Proves |
|---|---|---|
| `query` | `select 1` | `DATABASE_URL` is set and valid, TLS works, a query runs |
| `bypassesRls` | `select rolbypassrls … from pg_roles where rolname = current_user` | the login role skips RLS (`asSystem` relies on it) |
| `readsAuthUsers` | `select exists(select 1 from auth.users limit 1)` | the login role can read `auth.users` (`listUsers` does); reads no user data |
| `switchesToAuthenticated` | `set local role authenticated; select 1` | the login role can become `authenticated` (`asUser` does on every query) |

It returns `{ ok: true }` or `{ ok: false, failed: <check>, error: <name and code> }`, never the
error itself. `error` is the failing error's `name` plus its `code`, read from its `cause` when
that is an object (Drizzle wraps a failed query in an error named just `Error`; a string `cause`
is ignored). An error the database
sent back is always reported as `PostgresError`, since the production build renames postgres.js's
class. Examples: `PostgresError 28P01` (wrong password), `PostgresError 42501` (a missing
permission), `Error ECONNREFUSED` (nothing answers), `Error` plus Node's certificate error code (a
certificate that doesn't chain), `CheckFailed` (the login role doesn't skip RLS), or just `Error`
(our own `Missing DATABASE_URL` / `DATABASE_URL is not a valid URL`). Never the message, which can
hold the query text or the database address: a name that isn't 1 to 64 plain letters becomes
`unknown`, and a code that isn't 1 to 64 capital letters, digits or `_` is left out.

The route (`src/app/api/health/db/route.ts`, `dynamic = "force-dynamic"`, never cached) is public
on purpose: `/api` is not in `PROTECTED_PREFIXES`, so signed-out requests reach it. It answers 200
`{ ok: true }`, or 503 `{ ok: false }` and logs `Database health check failed: <check> (<name and
code>)` on the server. No data, version or detail leaves it.

Who calls it ([[release-ops]]):
- `deploy.yml`, step **"Site database answers"** after the Vercel hook: polls
  `<site>/api/health/db` every 15s for up to 5 minutes (site from `vars.PROD_SITE_URL` /
  `vars.DEV_SITE_URL`). It can't tell whether the new deployment or the previous one answered,
  and it also runs when the hook step skipped the deploy for a newer queued commit. A first deploy
  without `DATABASE_URL` in that Vercel environment fails here.
- `health.yml` (daily), step **"Site database answers"** for develop and production: fails
  unless the status is 200.
