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
   (all 9 under `src/app/(app)/admin/`: `page.tsx`, `upload/page.tsx`, `users/page.tsx`,
   `users/[id]/page.tsx`, `releases/page.tsx`, `releases/[id]/page.tsx`, `artists/page.tsx`,
   `artists/new/page.tsx`, `artists/[id]/page.tsx`). The page call is required: on client-side
   (RSC) navigation Next can render a child page without re-running its layout, so a
   layout-only gate is bypassable. `notFound()` renders `src/app/not-found.tsx`, which
   redirects signed-in users to `/feed` — a non-member sees the same thing as for any
   unknown URL, so the route's existence isn't revealed.
   **Rule: any new `admin/**/page.tsx` must `await requireLabelMember()` first** (nothing
   enforces this automatically; add a page test like `admin/page.test.tsx`).
3. **Per-action role check** — every admin server action starts with a role check and returns
   `"Only label members can do this."` otherwise:
   - `src/lib/admin/actions.ts` (`searchArtists`, `createUploadUrls`, `publishRelease`): `isLabelMember()` → `getCurrentRole()`.
   - `src/lib/admin/release-actions.ts` (`setPinned`, `moveRelease`, `archiveRelease`, `restoreRelease`, `removeTrack`,
     `restoreTrack`, `saveRelease`, `addAlbumTrack`, `replaceTrackAudio`): `getCurrentRole()`.
   - `src/lib/admin/users-actions.ts` (`createUser`, `issueInvite`, `setUserRole`, `updateUserProfile`, `setUserActive`) and
     `src/lib/admin/artists-actions.ts` (`createArtist`, `updateArtist`, `deleteArtist`, `searchLinkableUsers`):
     `activeLabelMemberId()` (`src/lib/admin/caller.ts`) — role check **plus** `auth.getUser()`, so a deactivated label
     member is refused even while their access token is still valid. The upload and release actions don't do this yet. Server actions are public
   HTTP endpoints; no layout or page protects them.
4. **Database** — `publish_release` checks `current_user_role()` itself and raises `42501`.
   `admin_set_user_role` (and every other admin SQL function) re-checks the same way. The user list
   is the exception: since Drizzle slice 1 it is read by `listUsers`, which checks the role in our
   code (`authorize(viewer, "users.list")`, `src/lib/services/policy.ts`) and then reads with RLS
   skipped (`asSystem`), so this layer doesn't apply to it ([[db-access]]). Even a direct PostgREST
   call (`/rest/v1/rpc/publish_release` with a listener's JWT) is refused. `releases` has no write
   policies, and `resolve_artist_refs` isn't executable through the API.

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

Roles are set from `app_metadata.role` at account creation (`/admin/users`, the seed's
`seed_helpers.seed_user`, or `scripts/invite-users.mts` on hosted) and changed in `/admin/users`
(`admin_set_user_role`, never your own). The role-trigger landmine is resolved: `user_metadata`
no longer sets roles. See [[invites]].

## Rollout pre-check

Before a migration reaches develop/prod (via `deploy.yml`, see [[release-ops]]), confirm Dashboard → Authentication → Allow new users to sign
up is OFF (the app is invite-only; role no longer reads `user_metadata`, but there's no reason
to allow sign-up).
