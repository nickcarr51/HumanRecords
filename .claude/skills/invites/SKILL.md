---
name: invites
description: Use when working on the `/admin/users` page and `/admin/users/[id]` (`NewUserForm`, `UsersTable`, `RoleSelect`, `InviteCell`, `UserForm`, `ActiveToggle`), `createUser`/`issueInvite`/`setUserRole`/`updateUserProfile`/`setUserActive` (`src/lib/admin/users-actions.ts`), `src/lib/invites/*` (`generateInviteToken`, `inviteUrl`, store functions), `getInviteGreeting`/`redeemInvite`, `InviteWelcome`, the `invites` table, `admin_list_users`/`admin_set_user_role`, `SITE_URL`, or NFC cards. Also when an invite link shows the plain login form instead of the welcome, a token is "already used" unexpectedly, or a card points at the wrong domain.
---

# Invites: admin-created users + single-use sign-in links

A label member creates an account at `/admin/users` (email, name, role). No email is sent.
The page shows a **single-use invite link** — `<SITE_URL>/login?email=<email>&invite=<token>` —
to copy, email by `mailto:`, or write to an NFC card. The invitee opens it, sees "Welcome,
<name>", taps **Enter**, and lands on `/feed` signed in. Built on branch
`feature/invite-system` (2026-10-02).

## The one thing to understand first

**Opening the link never consumes the token; only the Enter POST does.** `/login` is a server
component that calls `getInviteGreeting(token)`, which is read-only, so scanners, link
previewers, and reloads can't burn it. Enter submits a progressive server-action form (`redeemInviteForm` → `redeemInvite`), which
turns our long-lived single-use token into a real Supabase session server-side: **claim**
(atomic `UPDATE … WHERE token = $1 AND used_at IS NULL`) → `admin.getUserById` →
`admin.generateLink('magiclink')` (sends nothing) → `verifyOtp({ token_hash, type: 'email' })`
on the cookie-bound client → `redirect('/feed')`. If any step after the claim fails, the
token is **restored**. A used, unknown, or regenerated token is ignored silently: the normal
form appears with the email pre-filled.

## Pieces

| Concern | Where |
|---|---|
| `users.name`, role from `app_metadata`, two role triggers | `supabase/migrations/20261002120000_users_name_and_app_metadata_role.sql` |
| `invites` table, `admin_list_users`, `admin_set_user_role` | `supabase/migrations/20261002120100_create_invites.sql` |
| Token generator, `INVITE_TOKEN_RE` (`server-only`) | `src/lib/invites/token.ts` |
| Link builder (`siteUrl` is a required argument) | `src/lib/invites/url.ts` (`inviteUrl`) |
| Store: `upsertInvite`, `findUnusedInvite`, `claimInvite`, `restoreInvite` | `src/lib/invites/store.ts` |
| Admin actions: `createUser`, `issueInvite`, `setUserRole`, `updateUserProfile`, `setUserActive` | `src/lib/admin/users-actions.ts` |
| List + row mapping (`inviteUrl` for unused rows) | `src/lib/admin/users.ts`, types in `users-types.ts` |
| Welcome lookup (read-only) | `src/lib/auth/invite.ts` (`getInviteGreeting`) |
| Redeem (claim → sign-in → restore on failure) | `src/lib/auth/actions.ts` (`redeemInvite`) |
| `/login` (server component, `<meta name="referrer" content="no-referrer">` via `metadata.referrer`) | `src/app/login/page.tsx` |
| Login UI | `src/components/Login/{LoginForm,InviteWelcome}.tsx` |
| Users page | `src/app/(app)/admin/users/page.tsx` |
| Users UI | `src/components/AdminUsers/{NewUserForm,UsersTable,RoleSelect,InviteCell,mailto}.*`, `users.styles.ts` |
| User edit page (name/email form + deactivate toggle) | `src/app/(app)/admin/users/[id]/page.tsx`, `src/components/AdminUsers/{UserForm,ActiveToggle}.tsx` |
| Env | `SITE_URL` in `.env.example` / `.env.local` (`http://127.0.0.1:3000`) |

The server pages `/login` and `/admin/users` import components per folder
(`@/components/Login`, `@/components/AdminUsers`), not from the `@/components` barrel.

## Edit and deactivate (`/admin/users/[id]`)

- **`updateUserProfile`** — email changes go through `auth.admin.updateUserById` with
  `email_confirm: true` (no confirmation mail); the name is written to both `public.users.name`
  and `user_metadata.name`. If the name write fails after the auth update, the message says the
  email saved but the name didn't.
- **`setUserActive(userId, active)`** — deactivate = Supabase auth ban:
  `updateUserById(id, { ban_duration: '876000h' })`; reactivate = `'none'`. Reversible, download
  history kept. A label member cannot deactivate themself ("You can't deactivate yourself.").
- **`AdminUserRow.deactivated`** is derived from `banned_until` in the list mapper. The table
  shows a status and disables the invite controls (role select, link buttons) for deactivated
  rows, so to issue a link for a deactivated user: reactivate, New link, deactivate.

### Deactivation behaviour (verified locally 2026-10-10, GoTrue on local Supabase)

Verified against the local stack with a script that reproduces the app's calls (no browser).
Local JWTs are signed ES256 (asymmetric), so `getClaims()` verifies locally with no server
call; `jwt_expiry = 3600`.

1. **OTP refused, with a vague message.** `signInWithOtp({ shouldCreateUser: false })` for a
   banned email still *succeeds* (no error, code mail goes out). `verifyOtp` (and the
   generateLink + verifyOtp path) fails with 403 `user_banned` / "User is banned". `submitOtp`
   now checks for the ban first (`user_banned` / `/banned/i`) and shows "This account has been
   deactivated. Contact Human Records if you think this is a mistake." (no redirect).
2. **Existing session is not kicked immediately (decided limitation).** After banning: `refreshSession()` fails
   (400 `user_banned`, "Invalid Refresh Token: User Banned") and `getUser()` fails (403
   `user_banned`), but `getClaims()` still returns valid claims until the access token
   expires. The middleware and `getSessionUser` use `getClaims()`, so a banned user with an
   open session keeps access for up to the remaining access-token life (up to 1 hour, the
   `jwt_expiry`), then the refresh fails and they are signed out. No instant kick exists.
3. **Invite link for a deactivated user.** `redeemInvite` claims the token,
   `generateLink` still succeeds, `verifyOtp` fails with `user_banned`; the catch restores the
   token and returns the deactivated message (same copy as check 1). The token is not burned,
   so it works again after reactivation.

Decided (owner, 2026-10-10): no instant kick on deactivate. A banned user keeps access until the access token expires (≤1h), then the refresh fails and they are signed out. This is a documented limitation.

## References

- [token-lifecycle.md](References/token-lifecycle.md) — states, create/regenerate upsert,
  plaintext + no-grants rationale, `SITE_URL`, role-trigger consequences.
- [redeem-flow.md](References/redeem-flow.md) — `getInviteGreeting` and `redeemInvite` step by
  step, error copy, concurrency, signed-in visitors.
- [admin-users-page.md](References/admin-users-page.md) — actions, role checks in code and SQL,
  self-role guard, confirm copy, success alert, mailto placeholder.
- [testing.md](References/testing.md) — which tests cover what, plus the manual smoke script.

## Depends on

- [[auth]] — middleware (signed-in visitors never reach the welcome), `/login`, `getCurrentRole`.
- [[catalog-schema]] — `users`, `invites`, the triggers, definer functions, service client.
- [[admin-upload]] — the `/admin` portal, four-layer label-member gate, `requireLabelMember`.
- [[component-library]] — `Button`, `Select`, `Alert`, `FormField`, `Mono`, theme tokens.

## Known deferrals (as of 2026-10-02)

- **Invite email is still a `mailto:` link** with placeholder copy. (Hosted OTP/magic-link
  emails go through Resend SMTP: 30/hour cap, 60s per-email frequency; sender
  `noreply@humanrecords.co` — see [[release-ops]].)
- **No token expiry, Revoke, CSV export, search, or pagination** (under ~50 invitees).
- **Per-environment `SITE_URL`** must be set in each Vercel environment (prod:
  `https://services.humanrecords.co`; develop: `https://humanservices-dev.vercel.app`); see the domain
  cut-over ([[release-ops]] `References/domain-cutover.md`). Hosted develop test accounts come
  from `scripts/invite-users.mts` + gitignored `scripts/users.local.json`. NFC: write the
  final-domain invite URL, verify a tap, then lock the tag.
- **Crash between claim and sign-in** leaves the token used (no restore ran). Fallback: the
  invitee signs in with the email code, or an admin presses New link.
- **`RoleSelect` doesn't re-sync from props** after another admin changes the role; reload.
- **`app_metadata.role` can go stale** (see token-lifecycle); nothing reads it after creation.
- Generated `admin_list_users` types mark `name`, `invite_token`, `invite_used_at` non-null
  though they can be null; the mapper (`toAdminUserRow`) handles it.
- Switching accounts when a signed-in phone taps someone else's card; NTAG 424 / Web NFC.
