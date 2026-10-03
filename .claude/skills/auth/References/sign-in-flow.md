# Reference: Invite + sign-in flow

## End to end

1. **Invite.** An admin creates the auth user: Supabase dashboard "Invite user", or
   `admin.createUser`/`inviteUserByEmail` with `app_metadata: { role }, user_metadata: { name }`.
   The `handle_new_user` trigger creates the `public.users` row ([[catalog-schema]]). A
   dashboard invite sends the **invite** email (link to `/auth/confirm?…&type=invite`);
   `scripts/invite-users.mts` sends nothing — the user just signs in.
2. **Request a code.** `/login` email step → `requestOtp(email)` → Supabase sends the
   **magic_link** email containing both an 8-character code and a link.
3. **Either** type the code → `submitOtp(email, code, next)` → `verifyOtp({ type: 'email' })`
   → session cookies set → `redirect(safeNextPath(next))`.
   **Or** click the link → `GET /auth/confirm?token_hash=…&type=magiclink` →
   `verifyOtp({ token_hash, type })` → redirect to `safeNextPath(next)`.
4. Default destination is `/feed`.

## `src/lib/auth/actions.ts` (`"use server"`)

All return `{ error: string | null }` and never surface raw GoTrue text.

**`requestOtp(email)`**
- Trims + lowercases; empty → `"Email is required."` without calling Supabase.
- `signInWithOtp({ email, options: { shouldCreateUser: false } })` — **the invite-only guard**:
  an unknown email is refused instead of creating an account.
- Error mapping (regex on `error.message`, because wording varies across GoTrue versions):
  - `/not allowed|signup|not found/i` → "No invitation found for that email — Human Services
    is invite-only."
  - `/rate|too many/i` → "Too many attempts — wait a minute and try again."
  - anything else → "Something went wrong. Please try again."

**`submitOtp(email, token, next?)`**
- `verifyOtp({ email, token, type: 'email' })`.
- `/expired|invalid|incorrect|token/i` → "That code is invalid or expired — request a new one."
- Success calls `redirect()`, which **throws** `NEXT_REDIRECT` — so the client only ever sees a
  return value on failure (`res?.error`).

**`signOut()`** — `auth.signOut()` then `redirect('/login')`. Used as a `<form action>` in
`AppShell`.

## `/login` (`src/app/login/page.tsx`)

Server component (reads `searchParams`; see Invite links below) rendering `LoginForm`
(`src/components/Login/LoginForm.tsx`, client). State: `step: 'email' | 'code'`, `email`, `code`, `error`, `pending`.
- Props: `next` (passed through to `submitOtp`) and `?error=auth` (shows "That link didn't
  work — request a new code below.").
- Code step has **Resend code** (calls `requestOtp` again) and **Use a different email**
  (back to step 1, clears code/error).
- Code input: `inputMode="numeric"`, `autoComplete="one-time-code"`.

## Invite links (details in [[invites]])

URL shape `/login?email=&invite=`. Page load is read-only (`getInviteGreeting`): a valid unused
token shows `InviteWelcome`; anything else shows `LoginForm` with the email pre-filled and
**never auto-sends** a code. **Enter** → `redeemInvite`: claim token → `admin.getUserById` →
`admin.generateLink('magiclink')` → `verifyOtp({ token_hash, type: 'email' })` on the cookie
client → `/feed`; on failure the claim is restored. A used/unknown token is ignored silently.
`/login` sets `Referrer-Policy: no-referrer`. A signed-in visitor goes to `/feed` via
middleware with the token untouched.

## `/auth/confirm` (`src/app/auth/confirm/route.ts`)

`GET` route handler for email links.
- `ALLOWED_OTP_TYPES = ['invite', 'magiclink', 'email']`; any other `type` is rejected
  without calling Supabase (no blind cast into `verifyOtp`).
- `next` always goes through `safeNextPath` (blocks `https://evil`, `//evil`, `/\evil`).
- Missing params / bad type / verify error → `/login?error=auth`.

## Email templates + config

`supabase/config.toml` (local; mirror these in each hosted dashboard):
- `[auth] enable_signup = false`, `site_url = http://127.0.0.1:3000`.
- `[auth.email] otp_length = 8`, `otp_expiry = 3600` (1h), `max_frequency = 1m`.
- `[auth.email.template.invite]` → `supabase/templates/invite.html` — link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`.
- `[auth.email.template.magic_link]` → `supabase/templates/magic_link.html` — shows
  `{{ .Token }}` (the code) **and** a `type=magiclink` link.
- `[auth.rate_limit] email_sent = 2` (per hour, locally) — hitting it triggers the
  "Too many attempts" message.

Locally, emails land in Mailpit at `http://127.0.0.1:54324`.

## Changing the flow — watch-outs

- The `/login` hint says "8-character code"; keep it in sync with `otp_length`.
- Adding an email link type means adding it to `ALLOWED_OTP_TYPES` **and** a template.
- Any new redirect target from user input must go through `safeNextPath`.
