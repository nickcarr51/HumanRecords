# Reference: Onboarding users

## Prod (first admin, then the UI)

Do these once, by hand, in the prod Supabase dashboard (no bootstrap workflow, D8):

1. Authentication -> Invite user with the owner's email.
2. SQL editor, with the owner's real email substituted (never commit it):
   ```sql
   update auth.users
      set raw_app_meta_data = raw_app_meta_data || '{"role":"label_member"}'
    where email = '<owner email>';
   update public.users set name = '<Owner Name>'
    where id = (select id from auth.users where email = '<owner email>');
   ```
   The role-sync trigger copies the role into `public.users.role`.
3. Sign in on the prod site; everyone else is added at `/admin/users` (the `invites` skill).

Codes come from `noreply@humanrecords.co` and reach any address (Resend domain verified
2026-10-09; [environments.md](environments.md)).

## Develop

Accounts are added at `/admin/users` on the develop site, as on prod: a label member creates the
user, which creates the invite link; the link goes on an NFC card or is sent to the person (the
`invites` skill). The old `scripts/invite-users.mts` was deleted in Drizzle slice 2 (2026-10-28).
