# Reference: Opening and redeeming an invite link

## Page load (`src/app/login/page.tsx`, server component)

Reads `searchParams` (`email`, `invite`, `next`, `error`). With `invite`, calls
`getInviteGreeting(token)` (`src/lib/auth/invite.ts`): returns `{ name }` only if the token
matches `INVITE_TOKEN_RE` and an invite row exists with that token and `used_at` null;
`null` for empty/malformed/unknown/used tokens and on any error (logged). **Read-only.**

- Greeting → `<InviteWelcome token name email next />`.
- Otherwise → `<LoginForm initialEmail next linkFailed />`; the token is ignored silently.
  `?email=` pre-fills and **never auto-sends a code**.
- `metadata.referrer = 'no-referrer'` keeps the token out of `Referer` headers.

Symptom "link shows the plain form": token used, regenerated, malformed (not 43 base64url
chars, e.g. truncated by a mail client), or the lookup errored (check server logs).

## `InviteWelcome` (client)

"Welcome, <name>" (or "Welcome"), Enter button (`<form action>` bound via `useActionState` to the `redeemInviteForm` server action with a hidden `token` input, so it works before hydration → `redeemInvite(token)`; a thrown/rejected action lands in `src/app/login/error.tsx`),
"Not you? Sign in with email" swaps to `LoginForm`. On an error result it swaps to
`LoginForm` with the email pre-filled and the message in an `Alert`.

## `redeemInvite(token)` (`src/lib/auth/actions.ts`)

1. Malformed token → `USED`.
2. **Claim** with the service client (`claimInvite`). No row → `USED`. Claim throws → `FAILED`.
3. `admin.getUserById(claim.userId)` → email.
4. `admin.generateLink({ type: 'magiclink', email })` → `properties.hashed_token`. Sends no email.
5. Cookie-bound `createClient()` → `verifyOtp({ token_hash, type: 'email' })`; session cookies set.
6. Steps 3–5 fail → `restoreInvite` (a failing restore is logged) → `FAILED`.
7. Success → `redirect('/feed')` (outside any try/catch; it throws to navigate).

Copy: `USED` = "That link has already been used — sign in with your email below."
`FAILED` = "Couldn't sign you in — try again, or use your email below."

Why this shape: only Supabase Auth can issue a session, after a verified login. `generateLink`
plus an immediate `verifyOtp` is the server doing a magic-link sign-in for the user; the
Supabase hash never leaves the server. Supabase's own links expire (≤ 1h), so the long-lived
credential is our token.

## Concurrency and edge cases

- Two simultaneous Enter presses: the claim is one atomic UPDATE; the second re-checks the
  WHERE after the first commits, matches nothing, gets `USED`. At most one session.
- Regenerate during a redeem: restore matches the exact claim (`used_at`), so the new token wins.
- **Signed-in visitor:** middleware sends `/login?…` to `/feed` before the page renders; the
  token stays untouched.
- **Crash between claim and sign-in:** no restore runs; token stays used. Fallback: email OTP
  from the login form, or New link in `/admin/users`.
