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

At creation, from `app_metadata.role` via the `handle_new_user` trigger (default `listener`);
`app_metadata` is admin-only. A second trigger applies it when it is set or changed.
`public.users.role` is the truth afterwards. Label members change roles in `/admin/users`
(`admin_set_user_role`; never their own) — see [[invites]]. That RPC doesn't update
`app_metadata`, which can go stale.

### Role-trigger landmine — resolved (2026-10-02)

The trigger used to read role from user-writable `user_metadata`. It now reads only
`app_metadata`, so enabling self-signup no longer allows self-assigned `label_member`. Keep
`enable_signup = false` anyway (the app is invite-only).

## Inviting users

| Target | How |
|---|---|
| Any (admin UI) | `/admin/users` — [[invites]] |
| Local | `supabase/seed.sql` (`seed_helpers.seed_user`) — see [[catalog-schema]] `References/local-workflow.md` |
| Hosted develop | `node --env-file=.env.develop.local scripts/invite-users.mts --yes` — idempotent: creates missing users via `admin.createUser` (no email sent), fixes wrong roles, skips the rest. Refuses to run without `--yes`; prints the target URL first. |
| Hosted production | By hand in the Supabase dashboard (decide deliberately; the script is meant for develop). |

The script's `USERS` list is hard-coded (currently a label member and a listener). Edit it to
add accounts.
