# Reference: Running a query (`getDb`, `asUser`, `asSystem`)

## The connection (`src/lib/db/client.ts`)

- `getDb()` builds one Drizzle instance per server process the first time it is called, not when
  the module loads, so `yarn build` and every page that never touches the database work with
  `DATABASE_URL` unset. Unset → `Error("Missing DATABASE_URL")`; unparseable →
  `Error("DATABASE_URL is not a valid URL")` with no `cause` and no URL text (Node's own URL error
  would carry the whole string, password included).
- `createDb(client)` wraps a postgres.js client with the app's full schema (`generated/schema.ts`
  + `relations.ts` + `authUsers`). `getDb` uses it; tests use it to wrap one dedicated connection.
- `connectionOptions(url)` opens nothing, so unit tests call it directly:
  - `prepare: false` — the pooler may run each transaction on a different server connection, so
    postgres.js must not save a prepared query on one connection to reuse it later.
  - `max: 5`, `idle_timeout: 20` (seconds), `connect_timeout: 10` — Vercel runs the app as
    short-lived functions; fail fast instead of hanging a request.
  - `ssl` — `false` for `127.0.0.1` and `localhost` (the local stack has no TLS). Every other host
    gets `{ ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true }`: encrypted, and the server's
    certificate and hostname are checked against the Supabase Root 2021 CA kept in
    `src/lib/db/supabase-ca.ts` (public, the same for develop and production, expires 2031-04-26).
    Nothing is configured per environment. A `?sslmode=require` in the URL (Postgres's own TLS
    setting) can't weaken this: our option wins (pinned by `client.test.ts`). postgres.js on its
    own defaults to no TLS, so never build a hosted connection without these options.
- Never import `@/lib/db/client` (except types) outside `src/lib/db`; lint enforces it
  ([guard-rails.md](guard-rails.md)).

## Every transaction starts with `prepareTransaction` (`src/lib/db/transaction-setup.ts`)

One `select set_config(...)` statement (one round trip). Every setting uses `is_local = true`, so it
is undone when the transaction ends and a pooled connection never carries one request's identity
or timeouts into the next. Values are sent as query parameters, never pasted into the SQL text.

- Always: `statement_timeout` and `lock_timeout` = `10s`. Why: Supabase's docs set an 8s statement
  timeout for the `authenticated` role, and the local stack's `authenticator` role also has
  `lock_timeout = 8s` (seen locally, not documented by Supabase). A connection that logs in as
  `postgres` doesn't get those 8s settings, only Supabase's 2-minute global cap. 10s is the
  owner's choice (2026-10-24). A query that runs too long fails with Postgres code `57014`.
- With claims (`asUser` only): also `role = authenticated` and `request.jwt.claims` =
  `{ sub, role: "authenticated" }`. Only the user id is sent because the database reads nothing
  else (`auth.uid()` reads `request.jwt.claims ->> 'sub'`; no policy reads another claim).

## `asUser(claims, fn, db = getDb())` — runs as the signed-in user

- `claims` must be `JwtClaims` from `getClaims(supabase)` (below). The transaction then runs as
  `authenticated` with that user id, so `auth.uid()`, `current_user_role()` and every RLS policy
  and column grant apply, the same identity PostgREST uses.
- The whole transaction (begin, setup, `fn`, commit) is in a `try`; any error is rethrown through
  `fromPgError` ([errors-and-health.md](errors-and-health.md)).
- `db` is only passed by tests that check the connection is left clean.

Callers: `getFeed` (with `searchMatches` from `feed-search.ts`; [[timeline-player]]
`References/feed-and-album-data.md`) and `getViewer`. `getAlbum` went back to one supabase-js read
in slice 2; it still calls `getClaims` first, so a signed-out caller gets `UNAUTHENTICATED`.

## Who is calling (`src/lib/services/viewer.ts`)

- `getClaims(supabase)` calls `supabase.auth.getClaims()`, which verifies the token's signature
  (never trust the raw cookie). No claims, or no string `sub` → `DomainError("UNAUTHENTICATED",
  "Sign in to continue.")`. If the auth library reports an error (e.g. the auth server can't be
  reached), it logs one line, `Session check failed: <error name> (status <status|none>)`, never
  the token or the message, then throws the same `UNAUTHENTICATED`.
- `JwtClaims` carries a type-only marker, so code outside `getClaims` can't produce one without a
  cast (`yarn typecheck` catches a hand-built object). It is read-only, and `getClaims` returns a
  frozen copy (`Object.freeze`), so no code can swap in another user's id afterwards.
- `getViewer(supabase)` → `{ userId, role, claims }`. The role comes from the database
  (`select public.current_user_role()` through `asUser`), not the token: `changeUserRole` (like
  the `admin_set_user_role` SQL function before it) updates `public.users` but not
  `app_metadata`, so the token's copy can be stale. Unlike
  `getSessionUser()` ([[auth]]), it throws `UNAUTHENTICATED` when signed out instead of returning
  `null`. Every Viewer it returns is frozen (read-only type plus `Object.freeze`, so its role and
  user id can't be changed) and remembered in a private list (a `WeakSet`) that `isIssuedViewer`
  checks.

## `asSystem(grant, action, fn, db?)` — admin access after a permission check

- `authorize(viewer, action)` (`src/lib/services/policy.ts`) is the check:
  - it throws `DomainError("FORBIDDEN", "Not authorized.")` for a Viewer that `getViewer` didn't
    return (a hand-built or copied object);
  - then applies the rule for `action` (`RULES`). Today there are three actions, all label
    members only; anyone else gets `FORBIDDEN` with the action's message: `users.list` "Only
    label members can list users.", `users.setRole` "Only label members can change roles.",
    `artists.delete` "Only label members can delete artists.";
  - on success it returns a frozen `Grant` (`Object.freeze`) and remembers it in a private list
    (a `WeakSet`) that `isIssuedGrant` checks.
    `Grant` also has a type-only marker, so a hand-built one fails typecheck.
- `asSystem` throws `DomainError("FORBIDDEN", "Not authorized.")` before any database access when
  the grant wasn't issued by `authorize` or `grant.action !== action`. The optional `db` (tests
  only) is looked up inside the function, after that check, so a bad grant never reaches it.
- Then the transaction runs as `postgres`: RLS skipped, `auth.users` readable. `prepareTransaction`
  sets only the timeouts. Errors go through `fromPgError`, as in `asUser`.
- Only `src/lib/services/*` (and `src/lib/db`) may import it; lint enforces it.

Callers: `listUsers`, `changeUserRole` and `removeArtist`, below.

`listUsers(viewer)` (`src/lib/services/users.ts`) replaced the `admin_list_users`
SQL function: `users` joined to `auth.users`, plus each user's `invites` row if there is one,
newest first, at most `MAX_ROWS`, returning `UserRow[]` (`AdminListRow` in
`src/lib/admin/users.ts` is an alias). Its callers:
`listAdminUsers` (which re-sorts A to Z by name) and `getAdminUser` (`src/lib/admin/users.ts`)
and `linkedUsersFor` (`src/lib/admin/artists.ts`, used by `listAdminArtists`, `getAdminArtist`,
`loadLinkTargets`).
Each admin list call makes two transactions: `getViewer` (through `asUser`) and `listUsers`
(through `asSystem`). The owner kept this.

`changeUserRole(viewer, target, role)` (`src/lib/services/users.ts`, action `users.setRole`)
replaced the `admin_set_user_role` SQL function: after `authorize`, the caller's own id (compared case-insensitively, as Postgres compares uuids) →
`DomainError("INVALID", "You can't change your own role.")`; then `update users set role` where
`id = target`, and no row changed → `NOT_FOUND`. It updates `public.users.role` only, never
`app_metadata`. Caller: `setUserRole` (`src/lib/admin/users-actions.ts`, [[invites]]).

`removeArtist(viewer, id)` (`src/lib/services/artists.ts`, action `artists.delete`) replaced the
`admin_delete_artist` SQL function. In one `asSystem` transaction it deletes the artist (returning
the photo key); no row → `NOT_FOUND`; if the artist had a photo it inserts an `r2_cleanup_queue`
row (`reason` `archived`, `source_table` `artists`, `source_id` the artist id). An artist still
credited on a track or album makes Postgres refuse the delete with `23503`, which `fromPgError`
turns into `CONFLICT`; then nothing changes and nothing is queued. Caller: `deleteArtist`
(`src/lib/admin/artists-actions.ts`, [[admin-upload]]).

Both callers keep their `activeLabelMemberId()` check first (`setUserRole` calls it through its
`labelMemberId` alias, `deleteArtist` through its `isLabelMember()` helper), get the Viewer with
`getViewer(await createClient())`, and turn each `DomainError` code into the same message the SQL
function's error code gave. The role check runs in its own transaction (`getViewer`) just before
the write's transaction, not inside it as in the SQL functions (owner-accepted).

## Adding a new read or service

First check the rule ([slices.md](slices.md)): a read that changes nothing stays on supabase-js
unless supabase-js can't do it safely (like the feed search).

- **A user reading their own view** (feed-like): in the data function, `const claims = await
  getClaims(supabase)` then `asUser(claims, (tx) => tx.query.<table>.findMany({ ... }))`. Filter
  `archived_at` yourself: label members can read archived rows through RLS ([[content-lifecycle]]).
- **Something RLS can't express** (other users' data, `auth.users`, a write that today needs a
  definer function): add an `Action` and its rule in `policy.ts`, then a service in
  `src/lib/services/` that calls `authorize(viewer, action)` and passes the grant and the same
  action to `asSystem`. Pages and actions call the service with `await getViewer(supabase)`.
- Keep the caller's signature taking the supabase client, so existing tests keep working.

## Writing queries

- **Nested reads** (`tx.query.<table>.findMany/findFirst` with `columns` / `with`; Drizzle calls
  them relational queries) follow the
  hand-written relations in `src/lib/db/relations.ts`; the names are drizzle-kit's:
  `releases.track` / `releases.album`; `tracks.releases` / `trackAlbums` / `trackArtists`;
  `albums.releases` / `trackAlbums` / `albumArtists`; `artists.trackArtists` / `albumArtists`;
  `trackAlbums.track` / `album`; `trackArtists.track` / `artist`; `albumArtists.album` /
  `artist`. Note the singular `artist` (PostgREST's embed says `artists`). Shared `columns`/`with`
  shapes for the catalog live in `src/lib/supabase/catalog-selects.ts` (`ARTIST_NAMES`,
  `TRACK_WITH`).
- A nested read reads every column of a table it joins one-to-one (the generated SQL is
  `select * from "tracks"` inside). Revoking a column from `authenticated` would make such an
  `asUser` read fail with "permission denied"; change a grant only together with the matching
  Drizzle query.
- **`auth.users`** is declared by hand in `src/lib/db/auth-schema.ts` (`id`, `email`,
  `banned_until`) because the pull covers only `public`. Always alias it:
  `alias(authUsers, "auth_users")`. Unaliased, Drizzle names both `public.users` and `auth.users`
  `"users"` and Postgres fails with `table reference "users" is ambiguous`. Read it only through
  `asSystem`.
- **Timestamps**: select them with `pgrstTs(col)` (`src/lib/db/timestamps.ts`), which renders
  `to_json(col) #>> '{}'`, so the string is exactly what supabase-js returned
  (`2026-10-23T12:00:00.123456+00:00`, not Drizzle's default `2026-10-23 12:00:00.123456+00`).
  The type follows the column (non-null → `string`). A non-null column read through a left join
  can still be missing; use `pgrstTs(col) as SQL<string | null>` there.
- **Row cap**: list queries take `.limit(MAX_ROWS)` (or `Math.min(pageSize, MAX_ROWS)`), the same
  1000-row cap PostgREST puts on every supabase-js read (`max_rows` in `supabase/config.toml`; on
  hosted projects the dashboard's API "Max rows" setting). Counts stay exact.
- **Search text**: escape it with `escapeLike` (`src/lib/supabase/artists.ts`) before `ilike`.
- **No hand-written SQL strings**: the `sql` template tag sends each `${value}` separately from the
  SQL text. Outside `src/lib/db` lint bans `sql.raw` under any name and `.unsafe()`, which send a
  string as-is, and any use of `execute` except `` x.execute(sql`...`) `` with the template
  written in place, since `execute()` also sends a plain string as-is
  ([guard-rails.md](guard-rails.md)).

## Notes for writes (slice 2 onward)

- Requests through Supabase's API load the `safeupdate` extension, which refuses an `UPDATE` or
  `DELETE` with no `WHERE`. Drizzle connections don't, so a write must never rely on it.
  `removeArtist` and `changeUserRole` are the pattern: every update and delete has a `.where(...)`,
  and `.returning(...)` tells whether a row was hit (none → `NOT_FOUND`).
- `fromPgError` already maps the codes the SQL functions raise, so a ported write reports errors
  the same way ([errors-and-health.md](errors-and-health.md)).
