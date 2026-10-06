# Reference: Domain cut-over and NFC cards

Checklist, in order (D6; user does the dashboard steps):

1. Vercel: add the domains (`<domain>` to Production, `dev.<domain>` to the develop branch).
2. Resend: add the domain, add its DNS records, wait for verification; switch the SMTP sender in
   both Supabase projects from `onboarding@resend.dev` to an address on the domain.
3. Supabase (both projects): Site URL and redirect URLs to the new domains.
4. Vercel `SITE_URL` per environment, then redeploy.
5. R2 CORS: edit `infra/r2/cors.dev.json` and `cors.prod.json` with the new origins, re-paste into
   the Cloudflare buckets.
6. Update GitHub repository variables `{DEV,PROD}_SITE_URL` used by `health.yml`.
7. Smoke test on both sites: sign in with an emailed code, upload on develop, play a track.
8. Write and lock NFC cards last.

## NFC cards

From `/admin/users`, copy each person's invite link; it has the form
`https://<domain>/login?email=...&invite=...` (the `invites` skill). Write exactly that final-domain URL
to the tag, **verify a tap** opens the welcome screen, then **lock the tag**. Unlocked tags can be
rewritten by anyone's phone. Never write cards on a `*.vercel.app` URL.
