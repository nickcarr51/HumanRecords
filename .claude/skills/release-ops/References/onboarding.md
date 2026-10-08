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

Until Resend's domain is verified, only the Resend account owner receives codes
([environments.md](environments.md)).

## Develop

`node --env-file=.env.develop.local scripts/invite-users.mts --yes` reads the gitignored
`scripts/users.local.json` (copy `scripts/users.example.json`). It is idempotent, creates missing
users without sending email, fixes roles, and refuses to run without `--yes`. Develop only.
