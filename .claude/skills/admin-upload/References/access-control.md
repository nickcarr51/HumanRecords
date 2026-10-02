# Reference: Label-member access control

Only users whose `public.users.role = 'label_member'` may see `/admin` or publish. The
check exists at four layers because each one alone has a hole.

## The four layers

1. **Middleware** — `src/lib/auth/route-guard.ts`: `/admin` is in `PROTECTED_PREFIXES`, so
   a signed-out request for `/admin` or `/admin/*` is redirected to `/login` (wired through
   `src/lib/supabase/middleware.ts`). Middleware only knows *signed in or not*; it does not
   check role.
2. **Layout + page gates → 404 bounce** — `requireLabelMember()` in `src/lib/auth/role.ts`
   calls `notFound()` unless the role is `label_member`. It is called first in
   `src/app/(app)/admin/layout.tsx` **and** at the top of every admin page
   (`admin/page.tsx`, `admin/upload/page.tsx`). The page call is required: on client-side
   (RSC) navigation Next can render a child page without re-running its layout, so a
   layout-only gate is bypassable. `notFound()` renders `src/app/not-found.tsx`, which
   redirects signed-in users to `/feed` — a non-member sees the same thing as for any
   unknown URL, so the route's existence isn't revealed.
   **Rule: any new `admin/**/page.tsx` must `await requireLabelMember()` first** (nothing
   enforces this automatically; add a page test like `admin/page.test.tsx`).
3. **Per-action role check** — every server action in `src/lib/admin/actions.ts`
   (`searchArtists`, `createUploadUrls`, `publishRelease`) starts with `isLabelMember()`
   and returns `"Only label members can do this."` otherwise. Server actions are public
   HTTP endpoints; no layout or page protects them.
4. **Database** — `publish_release` checks `current_user_role()` itself and raises `42501`.
   Even a direct PostgREST call (`/rest/v1/rpc/publish_release` with a listener's JWT) is
   refused. `releases` has no write policies, and `resolve_artist_refs` isn't executable
   through the API.

## `current_user_role()` and `getCurrentRole()`

`users.role` is hidden from `authenticated` by a column grant
(`20260916140001_hide_user_role_column.sql`) so users can't see each other's roles. The
`security definer` SQL function `current_user_role()` returns only the caller's own role
(`where id = auth.uid()`).

`getCurrentRole()` calls it via the user's cookie-based server client and returns the role
or `null`; wrapped in React `cache()` so one request makes one RPC. It **never throws**: an RPC error or a thrown exception both return `null`
(callers treat `null` as "no access"). This matters because the `(app)` layout calls it on
every page render — a throw would take down the shell for all users.

## Navbar Admin link

`src/app/(app)/layout.tsx` calls `getCurrentRole()` and passes
`isLabelMember={role === "label_member"}` to `AppShell`, which renders `Admin` (→ `/admin`)
before Sign out only when true. This is convenience, not security. Known quirk: after a
role change the link can be stale until a full reload (the layout persists across
client navigation).

## Role assignment

Roles are set from `user_metadata.role` when the account is created (seed's
`pg_temp.seed_user`, or `scripts/invite-users.mts` on hosted). There's no UI for it. See
the memory note on the role trigger: if self-signup is ever enabled, the trigger must read
`app_metadata` instead, or anyone could sign up as a label member.

## Rollout pre-check

Before `db push` to develop/prod, confirm Supabase dashboard → Authentication → Allow new users to sign up is OFF. `handle_new_user` reads role from user-writable `user_metadata`; with signup on, anyone could self-register as label_member and publish.
