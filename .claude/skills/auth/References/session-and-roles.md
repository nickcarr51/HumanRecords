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

Callers: `(app)/layout.tsx`, `dashboard/page.tsx`, `not-found.tsx`, `admin/users/page.tsx`,
`admin/users/[id]/page.tsx`, `src/lib/feed/actions.ts`, and every server action in
`src/lib/storage/actions.ts` (uses `claims.sub` as the user id).

## `getClaims(supabase)` / `getViewer(supabase)` (`src/lib/services/viewer.ts`)

The same verified check for the Drizzle reads ([[db-access]]), with two differences: they take the
caller's supabase client (data functions receive it as their first argument), and they **throw**
`DomainError("UNAUTHENTICATED", "Sign in to continue.")` when signed out instead of returning
`null`. `getClaims` returns `JwtClaims` (a type only it can produce); when the auth library
reports an error it logs `Session check failed: <name> (status <status|none>)`, never the token.
`getViewer` adds the role, read from the database (`select public.current_user_role()` through
`asUser`), and returns `{ userId, role, claims }`. Callers: `getFeed`, `getAlbum` (`getClaims`),
`listAdminUsers`, `getAdminUser`, the `/admin/artists` reads, `setUserRole` and `deleteArtist`
(`getViewer`).

## App roles

`user_role = listener | artist | label_member`, stored in `public.users.role`. Hidden from
other members by a column grant; read your own via the `current_user_role()` RPC
([[catalog-schema]]), or `getViewer()` for Drizzle code (above).

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
(`setUserRole` → the `changeUserRole` service, which replaced the `admin_set_user_role` RPC in
Drizzle slice 2; never their own) — see [[invites]]. It doesn't update `app_metadata`, which can
go stale.

### Role-trigger landmine — resolved (2026-10-02)

The trigger used to read role from user-writable `user_metadata`. It now reads only
`app_metadata`, so enabling self-signup no longer allows self-assigned `label_member`. Keep
`enable_signup = false` anyway (the app is invite-only).

## Inviting users

| Target | How |
|---|---|
| Any (admin UI) | `/admin/users` — [[invites]] |
| Local | `supabase/seed.sql` (`seed_helpers.seed_user`) — see [[catalog-schema]] `References/local-workflow.md` |
| Hosted production, first label member | By hand in the prod Supabase dashboard, once ([[release-ops]] `References/onboarding.md`) |
| Hosted develop and production | `/admin/users` on that site: a label member creates the user, which creates the invite link; the link goes on an NFC card or is sent to the person — [[invites]] |

The old `scripts/invite-users.mts` script was deleted in Drizzle slice 2 (2026-10-28).
