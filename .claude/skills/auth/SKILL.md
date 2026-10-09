---
name: auth
description: Use when working on sign-in, sign-out, or session handling — the `/login` page, `requestOtp`/`submitOtp`/`signOut` (`src/lib/auth/actions.ts`), the `/auth/confirm` route, `src/middleware.ts` + `updateSession`, route protection (`route-guard.ts`, `PROTECTED_PREFIXES`), `safeNextPath` / the `?next=` param, `getSessionUser`, `getCurrentRole`/`requireLabelMember`, the `(app)` layout guard, Supabase email templates (`supabase/templates/*`), or inviting users. Also when users get randomly logged out, a redirect loops, an OTP/magic link fails, or a new route needs protecting.
---

# Auth: Invite-only Passwordless Sign-in

Human Services has no passwords and no sign-up. A member is **invited** (an `auth.users` row
created by an admin), then signs in with an **6-digit email code** (OTP) or by clicking
the **magic link** in the same email. Sessions live in Supabase cookies, refreshed by
middleware on every request. Signed-in users land on `/feed`.

## The one thing to understand first

**Three independent layers decide who sees what, and each one assumes the others might fail.**
1. **Middleware** (`src/middleware.ts` → `updateSession`) refreshes the session cookie and
   applies `authRedirectPath`: signed-out on a protected prefix → `/login?next=…`; signed-in
   on `/`, `/login`, or retired `/artists` → `/feed`. It knows *signed in or not*, never role.
2. **Server components** re-check: the `(app)` layout calls `getSessionUser()` and redirects
   to `/login`; admin pages call `requireLabelMember()`.
3. **Server actions and the database** re-check on every call (`getSessionUser()` in each
   action; RLS + definer functions in Postgres).
Invite-only is enforced by Supabase, not app code: `shouldCreateUser: false` on OTP request
plus `enable_signup = false`.

## Pieces

| Concern | Where |
|---|---|
| Middleware entry + matcher | `src/middleware.ts` |
| Session refresh, claims check, redirect + `?next=` | `src/lib/supabase/middleware.ts` (`updateSession`) |
| Pure redirect rules | `src/lib/auth/route-guard.ts` (`authRedirectPath`, `PROTECTED_PREFIXES`) |
| Open-redirect guard (default `/feed`) | `src/lib/auth/safe-next.ts` (`safeNextPath`) |
| Server actions: request code, verify code, sign out, `redeemInvite` (+ `redeemInviteForm`) | `src/lib/auth/actions.ts` |
| Invite welcome lookup (read-only) | `src/lib/auth/invite.ts` (`getInviteGreeting`) |
| Current claims (server) | `src/lib/auth/session.ts` (`getSessionUser`) |
| Own role + label-member gate | `src/lib/auth/role.ts` (`getCurrentRole`, `requireLabelMember`) |
| `/login` page (server component; invite branch) | `src/app/login/page.tsx` |
| Login UI (email step → code step, invite welcome) | `src/components/Login/{LoginForm,InviteWelcome}.tsx` |
| Magic-link / invite landing | `src/app/auth/confirm/route.ts` |
| Signed-in shell guard | `src/app/(app)/layout.tsx` |
| Signed-in 404 → `/feed` | `src/app/not-found.tsx` |
| Email templates | `supabase/templates/{invite,magic_link}.html`, wired in `supabase/config.toml` |
| Hosted test accounts | `scripts/invite-users.mts` |

## References

- [sign-in-flow.md](References/sign-in-flow.md) — invite → email → code or link → session;
  `requestOtp`/`submitOtp` error mapping; `/auth/confirm` allowed types; templates; config.
- [route-protection.md](References/route-protection.md) — the middleware, `authRedirectPath`
  rules, `?next=` round-trip, `safeNextPath`, layout/page guards, the 404 bounce, and how to
  protect a new route.
- [session-and-roles.md](References/session-and-roles.md) — `getClaims` vs `getUser`,
  `getSessionUser`, `getCurrentRole`/`requireLabelMember`, role assignment (from
  `app_metadata`; landmine resolved), inviting users.
- [testing.md](References/testing.md) — what each auth test covers and how they mock Supabase.

## Depends on

- [[catalog-schema]] — `public.users`, the `handle_new_user` trigger that copies role from
  `app_metadata`, the hidden `role` column, `current_user_role()`, and the server client.
- [[invites]] — the `/login?email=&invite=` welcome/Enter flow and `/admin/users`.
- [[component-library]] — login screen uses `Card`, `FormField`, `Input`, `Button`, `Alert`,
  and `Screen`.

Used by: [[media-storage]] (session-gated actions), [[timeline-player]] (`/feed` landing),
[[admin-upload]] (label-member gate — its `References/access-control.md` details the four
admin layers).

## Known deferrals (as of 2026-10-02)

- Invites live at `/admin/users` ([[invites]]); sending the invite is still a `mailto:` link.
  `scripts/invite-users.mts` (reads gitignored `scripts/users.local.json`; template
  `scripts/users.example.json`) remains for hosted develop accounts.
- **Hosted auth email is Resend SMTP** (`smtp.resend.com`, port 465, user `resend`). Sender is
  `noreply@humanrecords.co` (Resend domain `humanrecords.co` verified 2026-10-09). Caps: 30 emails/hour, 60s OTP frequency per email. Settings list:
  [[release-ops]] `References/environments.md`.
- No "artist" or "listener"-specific gating yet; only `label_member` is checked anywhere.
- Navbar Admin link can be stale after a role change until a full reload.

A code guide (request lifecycle, reading order) is in `Walkthrough/walkthrough.md` (gitignored).
