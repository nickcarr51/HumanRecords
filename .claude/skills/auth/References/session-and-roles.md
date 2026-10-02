# Reference: Session, claims, and roles

## `getSessionUser()` (`src/lib/auth/session.ts`)

```ts
const supabase = await createClient();
const { data } = await supabase.auth.getClaims();
return data?.claims ?? null;
```

Returns the verified JWT claims (`sub` = user id, `email`, `role: 'authenticated'`, …) or
`null`. Note `claims.role` is the **Postgres** role, not the app role.

Why `getClaims()`: it verifies the JWT signature (locally via JWKS where possible) instead of
trusting the cookie. Don't use `getSession()` on the server for authorization — it returns the
cookie contents unverified.

Callers: `(app)/layout.tsx`, `dashboard/page.tsx`, `not-found.tsx`, and every server action in
`src/lib/storage/actions.ts` (uses `claims.sub` as the user id).

## App roles

`user_role = listener | artist | label_member`, stored in `public.users.role`. Hidden from
other members by a column grant; read your own via the `current_user_role()` RPC
([[catalog-schema]]).

**`getCurrentRole()`** (`src/lib/auth/role.ts`) — `cache()`-wrapped (one RPC per request even
when layout and page both call it). Returns the role or `null`, and **never throws**: RPC error
→ `null`, thrown exception → `null`. Callers treat `null` as "no access". It never throws
because the `(app)` layout calls it on every render.

**`requireLabelMember()`** — `notFound()` unless role is `label_member`. Use at the top of
every label-member page.

`UserRole` type = `Database['public']['Enums']['user_role']`.

## How a user gets a role

Only at account creation, from `user_metadata.role` via the `handle_new_user` trigger
(defaults to `listener`). There's no in-app role editor. To change a role on a hosted project,
update `public.users.role` with the service role (what `scripts/invite-users.mts` does when a
role is wrong).

### Role-trigger landmine

`user_metadata` is writable by the user. If sign-up is ever enabled, anyone could register
with `{ role: 'label_member' }`. Before enabling any self-signup: move role to
`app_metadata` (admin-only) and update the trigger. Until then, keep `enable_signup = false`
locally and "Allow new users to sign up" OFF in every hosted dashboard.

## Inviting users

| Target | How |
|---|---|
| Local | `supabase/seed.sql` (`pg_temp.seed_user`) — see [[catalog-schema]] `References/local-workflow.md` |
| Hosted develop | `node --env-file=.env.develop.local scripts/invite-users.mts --yes` — idempotent: creates missing users via `admin.createUser` (no email sent), fixes wrong roles, skips the rest. Refuses to run without `--yes`; prints the target URL first. |
| Hosted production | By hand in the Supabase dashboard (decide deliberately; the script is meant for develop). |

The script's `USERS` list is hard-coded (currently a label member and a listener). Edit it to
add accounts.
