# Reference: Testing invites

## Needs local Supabase (`yarn supabase start`)

| File | Covers |
|---|---|
| `src/lib/supabase/invites.data.test.ts` | `user_metadata.role` ignored, `app_metadata.role` honored; anon/authenticated can't touch `invites`; `admin_list_users` (label member sees all, listener refused); `admin_set_user_role` (other user ok, self and listener refused). |
| `src/lib/invites/store.data.test.ts` | Claim, restore, regenerate against real rows; concurrent claims yield exactly one winner. |
| `src/lib/supabase/users.test.ts` | `users.name`, hidden `role` column. |

## Unit / component (mocked Supabase)

| File | Covers |
|---|---|
| `src/lib/invites/{token,url}.test.ts` | 43-char base64url unique tokens; URL encodes email, throws without `siteUrl`. |
| `src/lib/auth/invite.test.ts` | `getInviteGreeting`: name, null for unknown/used/malformed/error. |
| `src/lib/auth/redeem-invite.test.ts` | Claim miss → USED with no `generateLink`; success → `verifyOtp` on the cookie client + `/feed`; failure → restore + FAILED. |
| `src/lib/admin/users-actions.test.ts`, `users.test.ts` | Role refusal, email/duplicate mapping, soft invite failure, own-role refusal; row mapping. |
| `src/components/Login/*.test.tsx`, `src/app/login/page.test.tsx` | Pre-fill, no auto-send; welcome vs form; Enter, error fallback. |
| `src/components/AdminUsers/*.test.*`, `src/app/(app)/admin/users/page.test.tsx` | Three invite states, own-row select disabled, confirm before Regenerate, mailto, page gate. |

Run: `yarn test --run src/lib/invites src/lib/auth src/lib/admin src/components/Login src/components/AdminUsers`.

## Manual smoke (~10 min; `yarn supabase db reset && yarn dev`)

1. Sign in at `http://127.0.0.1:3000/login` as `quinoajonesmusic@gmail.com` (code in Mailpit,
   `http://127.0.0.1:54324`).
2. `/admin` → Users → create `guest+1@example.com`, name "Guest", Listener → success alert;
   row shows "Not used yet". Copy.
3. Private window → paste → "Welcome, Guest" → Enter → `/feed`.
4. Sign out → paste again → normal form with email pre-filled, no welcome, no Mailpit email.
5. Admin reload → "Used <date>" → New link → works once.
6. Change the guest's role to Artist → reload → persists; your own select is disabled.
7. Regenerate on an unused link → confirm mentions NFC → old link shows the plain form.
