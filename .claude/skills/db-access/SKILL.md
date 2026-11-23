---
name: db-access
description: Use when choosing between supabase-js and Drizzle for a query or mutation, about to write a SQL function (the rule in `References/data-access-rule.md`), writing or changing a database write that needs a transaction or a job supabase-js can't do safely, or anything in `src/lib/db/*` or `src/lib/services/*` — Drizzle ORM (`getDb`, `createDb`, `connectionOptions`, `Db`/`Tx`), `asUser` / `asSystem`, `prepareTransaction` and the 10s timeouts (`transaction-setup.ts`), `authorize` / `Grant` / `Action` / `isIssuedGrant` (`policy.ts`), `getViewer` / `getClaims` / `Viewer` / `JwtClaims` / `isIssuedViewer` (`viewer.ts`), `DomainError` / `DatabaseError` / `fromPgError` (`errors.ts`), `listUsers` / `UserRow` / `changeUserRole` (`services/users.ts`), `removeArtist` (`services/artists.ts`), `publishRelease` / `updateRelease` / `addAlbumTrack` / `archiveRelease` / `restoreRelease` / `archiveTrack` / `restoreTrack` / `replaceTrackAudio` / `moveRelease` (`services/releases.ts`), `MAX_ROWS` (`max-rows.ts`), `pgrstTs` (`timestamps.ts`), `relations.ts`, the `authUsers` alias (`auth-schema.ts`), `yarn db:pull` / `drizzle.config.ts` / `generated/schema.ts`, `DATABASE_URL`, the Supabase CA certificate (`supabase-ca.ts`), the database health check (`checkDatabase`, `/api/health/db`), the lint rules on database drivers / `sql.raw` / `execute()` / `.unsafe()`, the guard-hook rules for `drizzle-kit` and hosted database URLs, the slice map (how the SQL functions moved to Drizzle), or the database access tests (`References/testing.md`). Also when "Missing DATABASE_URL", "DATABASE_URL is not a valid URL", "Database query failed", "table reference \"users\" is ambiguous", "permission denied" from a Drizzle read, a certificate or connection error, a statement timeout (57014), `UNAUTHENTICATED` / `FORBIDDEN` / "Not authorized.", or a red "Site database answers" step appears.
---

# Database access: Drizzle, `asUser` / `asSystem`, services

How the app reads the database without going through Supabase's API: Drizzle ORM over a direct
Postgres connection (`DATABASE_URL`), always inside one of two functions that decide whose
permissions apply. Built on `feature/orm-scaffold-and-reads` (slice 1, 2026-10-23..25): the feed
and the admin user list read this way. Slice 2 (`feature/ORM-phase-2`, 2026-10-28) added the first
writes: deleting an artist (`removeArtist`) and changing a user's role (`changeUserRole`), and put
the album page back on supabase-js. Slice 3 (`feature/ORM-phase-3`, 2026-11-15) moved the
release admin's archive, restore, remove/restore track, replace file and reorder writes into
`src/lib/services/releases.ts`. Slice 4 (`feature/ORM-phase-4`, 2026-11-19) moved the last three
(publish, edit, add track), dropped the 11 SQL functions slices 1–3 replaced, and wrote the rule
down.

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
log or Sentry. **When to use Drizzle at all is the owner's rule in
[data-access-rule.md](References/data-access-rule.md): simple → supabase-js; a transaction or a
job supabase-js can't do safely → a Drizzle service, in the same PR that adds the complexity; app
logic in TypeScript, not new SQL functions.** Drizzle sits next to supabase-js, not instead of it.

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
| Safe errors: `DomainError`, `DatabaseError`, `fromPgError`, `isPostgresError` | `src/lib/services/errors.ts` |
| User services: `listUsers(viewer)`, `UserRow`, `changeUserRole(viewer, target, role)` | `src/lib/services/users.ts` |
| Artist service: `removeArtist(viewer, id)` | `src/lib/services/artists.ts` |
| Release services: `publishRelease`, `updateRelease`, `addAlbumTrack`, `archiveRelease`, `restoreRelease`, `archiveTrack`, `restoreTrack`, `replaceTrackAudio`, `moveRelease` (each `(viewer, …)`) | `src/lib/services/releases.ts` |
| Drizzle reads as the user | `src/lib/supabase/{feed,feed-search,catalog-selects,artist-names}.ts` ([[timeline-player]]) |
| Callers of `listUsers` | `src/lib/admin/users.ts` (`listAdminUsers`, `getAdminUser`), `src/lib/admin/artists.ts` (`linkedUsersFor`) |
| Callers of `changeUserRole` / `removeArtist` | `setUserRole` (`src/lib/admin/users-actions.ts`), `deleteArtist` (`src/lib/admin/artists-actions.ts`) |
| Callers of the release services | `saveRelease`, `addAlbumTrack`, `moveRelease`, `archiveRelease`, `restoreRelease`, `removeTrack`, `restoreTrack`, `replaceTrackAudio` through `runService` (`src/lib/admin/release-actions.ts`); `publishRelease` (`src/lib/admin/actions.ts`) |
| Lint rules | `eslint.config.mjs` |
| Guard hook rules (`drizzle-kit`, hosted database URLs) | `.claude/hooks/guard-db.sh`, tests `.claude/hooks/guard-db.drizzle.test.ts` |
| CI: `DATABASE_URL` for tests, schema diff | `.github/workflows/ci.yml` (`test`, `types`) |
| Deploy and daily checks of `/api/health/db` | `.github/workflows/deploy.yml`, `.github/workflows/health.yml` ([[release-ops]]) |

## References

- [running-queries.md](References/running-queries.md) — the connection and TLS,
  `prepareTransaction` and the timeouts, `asUser`, `asSystem` + `authorize` + `Grant`,
  `getViewer`, how to add a new read or service, relation names, the `auth.users` alias,
  `pgrstTs`, `MAX_ROWS`, notes for writes.
- [errors-and-health.md](References/errors-and-health.md) — `DomainError` / `DatabaseError` /
  `fromPgError` and the fixed messages, what each error message means, the health check.
- [guard-rails.md](References/guard-rails.md) — `DATABASE_URL` per environment, lint rules, the
  guard hook, `yarn db:pull` (sorted, policy names only) and the CI diff, the mis-rendered foreign
  keys in `generated/schema.ts`, Dependabot and esbuild.
- [data-access-rule.md](References/data-access-rule.md) — the rule: supabase-js or a Drizzle
  service, when to move, SQL limited to triggers and RLS helpers, the "can't do safely" cases.
- [slices.md](References/slices.md) — the slice map (how the SQL functions moved), the final
  cleanup, the SQL functions that stay, and the supabase-js code that stays on supabase-js.
- [testing.md](References/testing.md) — every database access test, what it proves, how to run
  them (local `DATABASE_URL`).

## Depends on

- [[catalog-schema]] — the tables, RLS policies, grants and SQL functions these queries run
  against; supabase-js clients for the work that stays on supabase-js.
- [[auth]] — the session cookie `getClaims()` verifies; `getCurrentRole` (supabase-js) vs
  `getViewer` (Drizzle).
- [[release-ops]] — `DATABASE_URL` in Vercel, the deploy/health workflows, the hook.

Used by: [[timeline-player]] (`getFeed`), [[invites]] (`/admin/users`: the list and the role
change), [[admin-upload]] (`/admin/artists` linked users and artist delete; publishing, and the
release admin's edit, add track, archive, restore, replace and reorder).

## Known deferrals (as of 2026-11-19)

- The final cleanup (its own branch, after slice 4 is live in production) drops
  `publish_release`, `update_release`, `add_album_track`, `resolve_artist_refs` and
  `increment_play_count`, and the tests that still call them
  ([slices.md](References/slices.md)).
- `src/lib/supabase/artists.ts` (the retired `/artists` reads and `escapeLike`): the owner brings
  the page back later.
- The hosted rollout checks (a)-(h) (pooler certificate, role timeouts, time zone, max rows,
  `DATABASE_URL` in Vercel) are in [[release-ops]] `References/environments.md`, "Hosted database
  checks".
