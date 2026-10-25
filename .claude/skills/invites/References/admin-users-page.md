# Reference: `/admin/users`

## Page (`src/app/(app)/admin/users/page.tsx`)

`await requireLabelMember()` first (layouts don't re-run on client navigation), then
`listAdminUsers(await createClient(), process.env.SITE_URL)`. That passes the **cookie** client to
`getViewer` (the caller's verified id, and their role read from `current_user_role()` through
Drizzle's `asUser`), then `listUsers(viewer)` (`src/lib/services/users.ts`): `authorize(viewer,
"users.list")` lets only label members through, and the query then runs with `asSystem` (admin
access, RLS skipped), because `auth.users` and `invites` aren't readable under RLS
([[db-access]]). Two transactions per load. The role check for the list is therefore in our code,
not in Postgres. A load failure renders an `Alert` (a missing
`SITE_URL` gets its own message). `/admin` has a **Users** `ActionCard` linking here.

## Actions (`src/lib/admin/users-actions.ts`, `"use server"`)

Each starts with `labelMemberId()` (`activeLabelMemberId()` in `src/lib/admin/caller.ts`: role via `getCurrentRole()` plus `auth.getUser()`, which fails for banned users); non
label members get "Only label members can do this." All return `{ error: string | null }`
and `revalidatePath('/admin/users')` on success.

- **`createUser({ email, name, role })`** — trims/lowercases email, regex check ("Enter a valid
  email."), role validated against `USER_ROLES`, name trimmed to 100 chars. Service-client
  `auth.admin.createUser({ email_confirm: true, app_metadata: { role }, user_metadata: { name } })`;
  sends no email. Duplicate (`/already|exists|registered/i`) → "That email already has an
  account — use its row in the table." Then `upsertInvite`; if that fails the account exists
  and the soft error says "Account created, but the invite link failed — use Create link in
  the table."
- **`issueInvite(userId)`** — Create link, New link, and Regenerate. UUID-validated; upsert.
- **`setUserRole(userId, role)`** — rejects the caller's own id ("You can't change your own
  role."), then `rpc('admin_set_user_role')` on the cookie client. SQLSTATEs: `42501` →
  forbidden, `22023` → own-role, `P0002` → "That user no longer exists."

## SQL (migration `20261002120100`)

Both functions are `security definer`, `set search_path = public`, execute revoked from
`public`/`anon`, granted to `authenticated`.
- `admin_list_users()` → `id, email, name, role, created_at, invite_token, invite_used_at, banned_until`
  (users ⟕ auth.users ⟕ invites, newest first). Raises `42501` unless `label_member`. No app
  callers since Drizzle slice 1: `listUsers` returns the same columns in the same order (proved by
  `users.parity.data.test.ts`). `banned_until` (added in `20261010120500`) is what
  `toAdminUserRow` turns into `deactivated` (a ban that hasn't expired yet).
- `admin_set_user_role(target uuid, new_role user_role)` → void. `42501` unless label member,
  `22023` if `target = auth.uid()`, `P0002` if no row. Updates `public.users.role` only.

So for `setUserRole`, the role and self-guard checks exist in the action **and** in Postgres. For
the list, the role check is `authorize()` in the users service.

## UI (`src/components/AdminUsers/`)

- All three action-calling components (`NewUserForm`, `RoleSelect`, `InviteCell`) wrap the
  server action in try/catch/finally: a thrown action (network drop, 500) shows
  "Something went wrong. Try again." and re-enables the control (RoleSelect also reverts).
- `NewUserForm`: email, name (`maxLength={100}`, matching the server-side cap), role `Select` (default listener). Success is an inline success
  `Alert` "Invite link created for <email>." (there is no app-wide Toast); fields clear.
- `UsersTable`: rows stack as cards below the tablet breakpoint. Own row's role select is
  disabled. `RoleSelect` saves on change, shows "Saved" or an error and reverts; it keeps
  local state and does not re-sync from props.
- `InviteCell` per state: Copy ("Copied ✓" for 2s), **Email**, **Regenerate**. Regenerate uses
  `window.confirm`: "The current link will stop working, including any NFC card already
  written with it." New link / Create link need no confirm (no live token to kill).
- `mailto.ts`: subject "Your Human Services invite", placeholder body containing the URL.
  Final wording comes with an email provider.
- Dates are formatted in UTC to avoid hydration mismatch.
