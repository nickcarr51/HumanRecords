# Reference: Testing auth

All auth tests are **unit tests** (no local Supabase needed). They mock
`@/lib/supabase/server` / `@supabase/ssr` and `next/navigation`.

| File | Covers |
|---|---|
| `src/lib/auth/actions.test.ts` | Empty email short-circuit; `shouldCreateUser: false`; rate-limit, invite-guard, and unknown error copy; `verifyOtp` type `email` + redirect; failure returns message and doesn't redirect; safe vs unsafe `next`; sign-out → `/login`. |
| `src/lib/auth/route-guard.test.ts` | Signed-out → `/login` on protected prefixes (incl. `/admin`); signed-in passes; signed-in `/` and `/login` → `/feed`; `/artists` retirement; public routes untouched. |
| `src/lib/auth/safe-next.test.ts` | Valid path unchanged; empty → `/feed`; rejects absolute, `//`, `/\`, no-slash. |
| `src/lib/auth/session.test.ts` | Claims when signed in; `null` when not. |
| `src/lib/auth/role.test.ts` | `getCurrentRole` returns the RPC role; `null` on error/no row/throw; `requireLabelMember` resolves for members. |
| `src/lib/supabase/middleware.test.ts` | Signed-out on protected → `/login?next=…`; signed-in `/login` → `/feed`; pass-through cases. |
| `src/app/auth/confirm/route.test.ts` | Success redirect to `next`; missing params / verify failure / unknown type → `/login?error=auth`; malicious `next` values neutralized; empty `next` → `/feed`. |
| `src/components/Login/LoginForm.test.tsx` | Email → code step; error display; "use a different email"; resend; pre-fill from `initialEmail`, no `requestOtp` on mount. |
| `src/components/Login/InviteWelcome.test.tsx` | Name/fallback; Enter calls `redeemInviteForm` with the token; error → email form with Alert. |
| `src/app/login/page.test.tsx` | Server page: welcome vs form, token ignored when unknown/used, `?error=auth`. |
| `src/lib/auth/invite.test.ts`, `redeem-invite.test.ts` | `getInviteGreeting`; `redeemInvite` claim/sign-in/restore (see [[invites]]). |
| `src/app/not-found.test.tsx` | Signed-in redirect to `/feed`; signed-out no redirect. |

Mocking `redirect`: tests make the mocked `redirect` throw (like the real one) or record the
call, then assert on the argument. Remember the real `redirect()` throws `NEXT_REDIRECT`, so
code after it never runs.

Real OTP verification against Postgres is exercised indirectly by every data test via
`createTestUser().signIn()` (`generateLink` + `verifyOtp`) — see [[catalog-schema]].

Run: `yarn test --run src/lib/auth src/app/auth src/app/login src/lib/supabase/middleware.test.ts`.

Manual smoke: `yarn supabase migration up && yarn dev` → `/login` as `label@example.com` → read the
code in Mailpit (`http://127.0.0.1:54324`) → lands on `/feed` with an Admin link; sign out →
`/login`; visit `/albums/x` signed out → `/login?next=/albums/x`.
