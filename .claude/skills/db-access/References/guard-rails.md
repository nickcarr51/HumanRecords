# Reference: `DATABASE_URL`, lint, the guard hook, the schema pull

## `DATABASE_URL` per environment

Server-only (never `NEXT_PUBLIC_`), read in exactly one place: `getDb()` in `src/lib/db/client.ts`.

| Where | Value |
|---|---|
| Local (`.env.local`) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Must stay local: `test-helpers.ts` refuses to run the data tests with any other host, and the guard hook asks before a command that carries a hosted URL |
| CI `test` job | The `DB_URL` that `supabase status -o env` prints for the CI job's own local stack (`ci.yml`, "Point tests at the local stack"). Not the GitHub environment secret of the same name, which holds a hosted connection string for `deploy.yml` |
| CI `app` job | Unset: `yarn build` works without it |
| Develop / Production (Vercel Preview for `develop` / Production) | That Supabase project's **transaction pooler** URL (port 6543), pasted by the owner before the deploy that first needs it ([[release-ops]] `References/environments.md`) |

`drizzle.config.ts` never reads it: `yarn db:pull` is hard-coded to the local stack.

## Lint (`eslint.config.mjs`)

| Where | Not allowed | Why |
|---|---|---|
| All of `src/` outside `src/lib/db` (services included) | importing `postgres` or `drizzle-orm/*-js` (e.g. `drizzle-orm/postgres-js`) | only `src/lib/db` opens a connection; a direct one logs in as `postgres` and skips `asUser` and RLS |
| Outside `src/lib/db` and `src/lib/services` | importing `@/lib/db/client` (type imports are allowed) or `@/lib/db/system` | use `asUser` or a service; `asSystem` skips RLS |
| `src/lib/services` | importing `@/lib/db/client` (type imports allowed) | go through `asUser` or `asSystem` |
| All of `src/` outside `src/lib/db` | `sql.raw(...)` and `.unsafe(...)` | both send a string to the database as-is, with no value escaping |

`src/lib/db/generated/**` is ignored by lint (generated code).

## The guard hook (`.claude/hooks/guard-db.sh`)

On top of the Supabase and R2 rules (CLAUDE.md "Database safety"), the hook forces a permission
prompt on:
- `drizzle-kit` with `push`, `migrate`, `drop` or `up`. `push`/`migrate` change a database;
  `drop`/`up` rewrite Drizzle migration files. Supabase migrations are the only schema path, so
  none of these is ever needed.
- `drizzle-kit` with a hosted host (`supabase.co`, `supabase.com`, `pooler.supabase`).
- Any command containing a hosted Supabase database URL (`postgres://` or `postgresql://` whose
  host is under `supabase.co`, `supabase.com` or `pooler.supabase`), e.g.
  `DATABASE_URL=<hosted> yarn dev` or `yarn test`: the app and the tests connect straight to
  `DATABASE_URL`.

It can't see a URL inside a shell variable or a file (`.env.local`), so `.env.local` must hold
only the local URL. Tests: `.claude/hooks/guard-db.drizzle.test.ts` (plus `guard-db.test.ts`
for the older rules).

## The pulled schema (`yarn db:pull`)

- `yarn db:pull` = `drizzle-kit pull` against the local stack only (`drizzle.config.ts`:
  `127.0.0.1:54322`, `schemaFilter: ["public"]`), into the gitignored `.drizzle-pull/`, then copies
  only `schema.ts` to `src/lib/db/generated/`. Never hand-edit `generated/`.
- Re-run it after every migration, next to the `database.types.ts` regeneration ([[catalog-schema]]
  `References/clients-and-types.md`), and commit the result. CI's `types` job re-pulls and fails on
  any diff ("Drizzle schema matches the committed file").
- Only `schema.ts` is used: the pulled `relations.ts` doesn't compile (it names an `auth.users`
  table a `public`-only pull never generates), so `src/lib/db/relations.ts` is hand-written.
  `src/lib/db/relations.test.ts` checks that every link in it matches a foreign key in
  `generated/schema.ts` (same tables and columns).
- **Wrong foreign keys in `generated/schema.ts`.** Two references to `auth.users` come out wrong
  because the pull covers only `public`: `users.id`'s foreign key is rendered as pointing at
  `users.id` itself (`users_id_fkey`), and both `invites` foreign keys (`invites_user_id_fkey`,
  `invites_created_by_fkey`) as pointing at `public.users`. In the database all three point at
  `auth.users`. No query uses them today. Don't build Drizzle relations on them; for `auth.users`
  use `authUsers` with the alias ([running-queries.md](running-queries.md)).

## Dependabot and esbuild

`drizzle-kit` is a development tool (`yarn db:pull`, locally and in CI); it is never part of the
deployed app. It depends on `@esbuild-kit/esm-loader`, which depends on `@esbuild-kit/core-utils`,
which pins `esbuild ~0.18.20` (`yarn.lock`; drizzle-kit's own esbuild is 0.25.x). The public
GitHub advisory GHSA-67mh-4wv8-2f99 (esbuild up to 0.24.2, fixed in 0.25.0) is about esbuild's
built-in development web server. `@esbuild-kit/core-utils` only calls esbuild's `transform` /
`transformSync`, never that server, so the warning doesn't apply here. If Dependabot raises it,
prefer a `drizzle-kit` upgrade that drops `@esbuild-kit` over pinning esbuild.
