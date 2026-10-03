# Reference: Invite token lifecycle

## Table

`public.invites`: `user_id` (PK → `auth.users`, cascade; **one row per user**), `token text
unique` (nullable), `used_at timestamptz` (nullable), `created_by → auth.users` (set null),
`created_at`, `updated_at`. RLS on, **no policies**, all privileges revoked from `anon` and
`authenticated`: only the service role (`createServiceClient`) and definer functions touch it.

The token is **plaintext** (32 random bytes, base64url, 43 chars; `INVITE_TOKEN_RE`) so the admin
page can re-show the URL any time. The no-grants rule is what protects it: a signed-in user
can't read anyone's token. `admin_list_users()` (label members only) is the one reader.

## States

| State | Row | Shown as |
|---|---|---|
| none | no row | "No link" · **Create link** |
| unused | `token` set, `used_at` null | "Not used yet" · URL, Copy, Email, Regenerate |
| used | `token` null, `used_at` set | "Used <date>" · **New link** |

Mapping lives in `toAdminUserRow` (`used_at` wins, then `token`).

## Transitions (`src/lib/invites/store.ts`)

- **Create / Regenerate / New link** → `upsertInvite`: upsert on `user_id` with a new token,
  `used_at = null`, `created_by` = caller, `updated_at = now()`. The old token stops working
  immediately (it no longer exists).
- **Claim** → `claimInvite`: one `UPDATE … SET token = null, used_at = now() WHERE token = $1
  AND used_at IS NULL RETURNING user_id, used_at`. Exactly one concurrent caller gets a row.
- **Restore** → `restoreInvite`: only after a failed sign-in; `WHERE user_id = $1 AND token IS
  NULL AND used_at = <claimed_at>`, so a Regenerate that landed in between wins.

## `SITE_URL`

`inviteUrl(email, token, siteUrl)` — `siteUrl` is a **required argument with no default**;
callers pass `process.env.SITE_URL` (the users page via `listAdminUsers`). Undefined throws
"SITE_URL is not set". It is never derived from the request host, so a card written during
local testing can't silently point elsewhere. Local value: `http://127.0.0.1:3000`. Hosted:
set per Vercel environment (pending). A card pointing at the wrong domain means the link was
generated while `SITE_URL` had a different value; Regenerate after fixing it.

## Role triggers (migration `20261002120000`)

- `handle_new_user` (after insert on `auth.users`): `name` from `raw_user_meta_data.name`,
  `role` from `raw_app_meta_data.role` (default `listener`) — **never** from `user_metadata`.
  This closes the old role-trigger landmine.
- `sync_user_role_from_app_metadata` (after update of `raw_app_meta_data`, only when
  `app_metadata.role` is non-null and changed): needed because GoTrue's admin `createUser`
  inserts `auth.users` first and applies `app_metadata` in a later UPDATE.
- Consequence: changing `app_metadata.role` through the admin API **overrides**
  `public.users.role`. `admin_set_user_role` changes `public.users.role` only, so
  `app_metadata.role` can go stale. `public.users.role` is the truth; nothing reads
  `app_metadata.role` after creation.
