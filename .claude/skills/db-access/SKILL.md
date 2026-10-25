---
name: db-access
description: Use when writing or changing a database read or write that touches more than one table, or anything in `src/lib/db/*` or `src/lib/services/*` — Drizzle ORM (`getDb`, `createDb`, `connectionOptions`, `Db`/`Tx`), `asUser` / `asSystem`, `prepareTransaction` and the 10s timeouts (`transaction-setup.ts`), `authorize` / `Grant` / `Action` / `isIssuedGrant` (`policy.ts`), `getViewer` / `getClaims` / `Viewer` / `JwtClaims` / `isIssuedViewer` (`viewer.ts`), `DomainError` / `DatabaseError` / `fromPgError` (`errors.ts`), `listUsers` / `UserRow` (`services/users.ts`), `MAX_ROWS` (`max-rows.ts`), `pgrstTs` (`timestamps.ts`), `relations.ts`, the `authUsers` alias (`auth-schema.ts`), `yarn db:pull` / `drizzle.config.ts` / `generated/schema.ts`, `DATABASE_URL`, the Supabase CA certificate (`supabase-ca.ts`), the database health check (`checkDatabase`, `/api/health/db`), the lint rules on `postgres` / `drizzle-orm/*-js` / `sql.raw` / `.unsafe()`, the guard-hook rules for `drizzle-kit` and hosted database URLs, the slice map (which supabase-js reads and SQL functions move to Drizzle next), or the database access tests (`db-access.data.test.ts`, `*.parity.data.test.ts`, `client.test.ts`, `relations.test.ts`, `health.data.test.ts`). Also when "Missing DATABASE_URL", "DATABASE_URL is not a valid URL", "Database query failed", "table reference \"users\" is ambiguous", "permission denied" from a Drizzle read, a certificate or connection error, a statement timeout (57014), `UNAUTHENTICATED` / `FORBIDDEN` / "Not authorized.", or a red "Site database answers" step appears.
---

# Database access: Drizzle, `asUser` / `asSystem`, services

How the app reads the database without going through Supabase's API: Drizzle ORM over a direct
Postgres connection (`DATABASE_URL`), always inside one of two functions that decide whose
permissions apply. Built on `feature/orm-scaffold-and-reads` (slice 1, 2026-10-23..25): the feed,
the album page and the admin user list read this way. Writes come in later slices.

Words used here, once:
- **Drizzle** (`drizzle-orm`): a TypeScript library that builds SQL from typed table objects.
  **postgres.js** (the npm package `postgres`) is the driver that sends that SQL to Postgres.
- **RLS** (row level security): the database's permission rules, the policies in the migrations.
- **Transaction**: a group of statements that succeed or fail together. A setting made "for
  this transaction only" (`set_config(..., true)`) is undone when the transaction ends.
- **Pooler**: Supabase's shared connection pool (Supavisor) in front of each hosted database. Its
  "transaction" mode, on port 6543, may run each transaction on a different server connection.
- **TLS**: the encrypted connection. "Verified" TLS also checks the server's certificate against a
  certificate we trust, so the app can't be talking to an impostor.

## The one thing to understand first

**Every Drizzle query runs inside `asUser` or `asSystem`, and the choice is the permission
decision.** The connection logs in as the `postgres` role, which skips RLS. So:
- **`asUser(claims, fn)`** (`src/lib/db/user.ts`) first switches the transaction to the
  `authenticated` role with the signed-in user's id, so RLS applies exactly as it does through
  supabase-js. Use it for anything a user reads on their own behalf.
- **`asSystem(grant, action, fn)`** (`src/lib/db/system.ts`) keeps the `postgres` role (RLS
  skipped, `auth.users` readable). It runs only with a `Grant` that `authorize(viewer, action)`
  returned for that same `action`, so our code has checked the permission first. It works like a
  SQL function that runs with its owner's rights (`security definer`), with the check in
  TypeScript instead of SQL. Lint lets only `src/lib/services` (and `src/lib/db`) import it.

Both start with `prepareTransaction`, which sets 10s timeouts for the transaction only, and both
turn every database error into a safe error (`fromPgError`), so SQL text never reaches a user, a
log or Sentry. **The rule (owner's): a read or write on one table stays supabase-js; more than one
table goes through Drizzle.** Drizzle sits next to supabase-js, not instead of it.

## Pieces

| Concern | Where |
|---|---|
| Connection: `getDb()` (created on first use), `createDb(client)`, `connectionOptions(url)`, `Db`, `Tx` | `src/lib/db/client.ts` |
| Supabase Root 2021 CA certificate (public, expires 2031-04-26) | `src/lib/db/supabase-ca.ts` |
| Per-transaction setup: `prepareTransaction(tx, claims?)`, 10s timeouts | `src/lib/db/transaction-setup.ts` |
| Run as the signed-in user (RLS applies) | `src/lib/db/user.ts` (`asUser`) |
| Run with admin access after a permission check (RLS skipped) | `src/lib/db/system.ts` (`asSystem`) |
| Row cap shared with PostgREST (`MAX_ROWS = 1000`) | `src/lib/db/max-rows.ts` |
| PostgREST-identical timestamp strings | `src/lib/db/timestamps.ts` (`pgrstTs`) |
| `auth.users` columns the app reads (hand-written) | `src/lib/db/auth-schema.ts` (`authUsers`) |
| Catalog relations (hand-written) | `src/lib/db/relations.ts` |
| Pulled table schema (generated, never hand-edit) | `src/lib/db/generated/schema.ts` (`yarn db:pull`, `drizzle.config.ts`) |
| Health check: `checkDatabase(db?)` and the public route | `src/lib/db/health.ts`, `src/app/api/health/db/route.ts` |
| Who is calling: `getClaims`, `getViewer`, `Viewer`, `JwtClaims`, `isIssuedViewer` | `src/lib/services/viewer.ts` |
| Permission check: `authorize`, `Grant`, `Action`, `isIssuedGrant` | `src/lib/services/policy.ts` |
| Safe errors: `DomainError`, `DatabaseError`, `fromPgError` | `src/lib/services/errors.ts` |
| First service: `listUsers(viewer)`, `UserRow` | `src/lib/services/users.ts` |
| Drizzle reads as the user | `src/lib/supabase/{feed,feed-search,albums,catalog-selects,artist-names}.ts` ([[timeline-player]]) |
| Callers of `listUsers` | `src/lib/admin/users.ts` (`listAdminUsers`, `getAdminUser`), `src/lib/admin/artists.ts` (`linkedUsersFor`) |
| Lint rules | `eslint.config.mjs` |
| Guard hook rules (`drizzle-kit`, hosted database URLs) | `.claude/hooks/guard-db.sh`, tests `.claude/hooks/guard-db.drizzle.test.ts` |
| CI: `DATABASE_URL` for tests, schema diff | `.github/workflows/ci.yml` (`test`, `types`) |
| Deploy and daily checks of `/api/health/db` | `.github/workflows/deploy.yml`, `.github/workflows/health.yml` ([[release-ops]]) |

## References

- [running-queries.md](References/running-queries.md) — the connection and TLS,
  `prepareTransaction` and the timeouts, `asUser`, `asSystem` + `authorize` + `Grant`, `getViewer`, how to add a new
  read or service, relation names, the `auth.users` alias, `pgrstTs`, `MAX_ROWS`, notes for writes.
- [errors-and-health.md](References/errors-and-health.md) — `DomainError` / `DatabaseError` /
  `fromPgError` and the fixed messages, what each error message means, the health check.
- [guard-rails.md](References/guard-rails.md) — `DATABASE_URL` per environment, lint rules, the
  guard hook, `yarn db:pull` and the CI diff, the mis-rendered foreign keys in
  `generated/schema.ts`, Dependabot and esbuild.
- [slices.md](References/slices.md) — the one-table / many-table rule, the slice map, and every
  many-table supabase-js read or write not moved yet, with its slice.
- [testing.md](References/testing.md) — every database access test, what it proves, how to run
  them (local `DATABASE_URL`).

## Depends on

- [[catalog-schema]] — the tables, RLS policies, grants and SQL functions these queries run
  against; supabase-js clients for one-table work.
- [[auth]] — the session cookie `getClaims()` verifies; `getCurrentRole` (supabase-js) vs
  `getViewer` (Drizzle).
- [[release-ops]] — `DATABASE_URL` in Vercel, the deploy/health workflows, the hook.

Used by: [[timeline-player]] (`getFeed`, `getAlbum`), [[invites]] (`/admin/users`),
[[admin-upload]] (`/admin/artists` linked users).

## Known deferrals (as of 2026-10-25)

- Slice 1 is reads only. Writes and the remaining many-table reads are mapped to slices 2-5
  ([slices.md](References/slices.md)). `fromPgError`'s mapped codes are there for them.
- `search_feed` and `admin_list_users` stay in the database with no app callers (the parity
  tests use them); a later cleanup migration drops them.
- The hosted rollout checks (pooler certificate, role timeouts, time zone, max rows) are listed in
  the slice 1 plan, Task 7 (`docs/superpowers/plans/2026-10-23-drizzle-services-slice1.md`,
  gitignored, local).
