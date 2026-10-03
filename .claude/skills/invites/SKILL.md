---
name: invites
description: Use when working on the `/admin/users` page (`NewUserForm`, `UsersTable`, `RoleSelect`, `InviteCell`), `createUser`/`issueInvite`/`setUserRole` (`src/lib/admin/users-actions.ts`), `src/lib/invites/*` (`generateInviteToken`, `inviteUrl`, store functions), `getInviteGreeting`/`redeemInvite`, `InviteWelcome`, the `invites` table, `admin_list_users`/`admin_set_user_role`, `SITE_URL`, or NFC cards. Also when an invite link shows the plain login form instead of the welcome, a token is "already used" unexpectedly, or a card points at the wrong domain.
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
| Admin actions: `createUser`, `issueInvite`, `setUserRole` | `src/lib/admin/users-actions.ts` |
| List + row mapping (`inviteUrl` for unused rows) | `src/lib/admin/users.ts`, types in `users-types.ts` |
| Welcome lookup (read-only) | `src/lib/auth/invite.ts` (`getInviteGreeting`) |
| Redeem (claim → sign-in → restore on failure) | `src/lib/auth/actions.ts` (`redeemInvite`) |
| `/login` (server component, `<meta name="referrer" content="no-referrer">` via `metadata.referrer`) | `src/app/login/page.tsx` |
| Login UI | `src/components/Login/{LoginForm,InviteWelcome}.tsx` |
| Users page | `src/app/(app)/admin/users/page.tsx` |
| Users UI | `src/components/AdminUsers/{NewUserForm,UsersTable,RoleSelect,InviteCell,mailto}.*`, `users.styles.ts` |
| Env | `SITE_URL` in `.env.example` / `.env.local` (`http://127.0.0.1:3000`) |

The server pages `/login` and `/admin/users` import components per folder
(`@/components/Login`, `@/components/AdminUsers`), not from the `@/components` barrel.

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

- **No email provider.** **Email** is a `mailto:` link with placeholder copy.
- **No token expiry, Revoke, CSV export, search, or pagination** (under ~50 invitees).
- **Hosted setup pending** the deployment session: `SITE_URL` per Vercel environment, and
  custom SMTP so OTP emails reach real users (Supabase's built-in SMTP only delivers to team
  members).
- **Crash between claim and sign-in** leaves the token used (no restore ran). Fallback: the
  invitee signs in with the email code, or an admin presses New link.
- **`RoleSelect` doesn't re-sync from props** after another admin changes the role; reload.
- **`app_metadata.role` can go stale** (see token-lifecycle); nothing reads it after creation.
- Generated `admin_list_users` types mark `name`, `invite_token`, `invite_used_at` non-null
  though they can be null; the mapper (`toAdminUserRow`) handles it.
- Switching accounts when a signed-in phone taps someone else's card; NTAG 424 / Web NFC.
