# Reference: Domain cut-over and NFC cards

**Done 2026-10-09 for prod.** Prod → `https://services.humanrecords.co`; develop stays on
`https://humanservices-dev.vercel.app` (no dev subdomain). `humanrecords.co` itself is the Cargo
display site — never touch its `@`/`www` records or the Proton Mail records (MX, `protonmail*._domainkey`).

DNS lives in **Cargo** (nameservers `ns1/ns2.cargo.site`): Cargo → Account Settings → Domain Names →
`···` → Edit DNS. Do NOT switch nameservers to Vercel (would break the Cargo site and Proton mail).
Records added for this app:

| Type | Name | Value | For |
|---|---|---|---|
| A | `services` | `76.76.21.21` | Vercel (prod) |
| TXT | `resend._domainkey` | Resend DKIM key (`p=MIGfMA…`) | Resend |
| CNAME | `rsend` | `rsend.forge.rmta.net.` | Resend SPF |
| CNAME | `send` | `send.forge.rmta.net.` | Resend SPF |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DMARC (shared with Proton; only one allowed) |

Cargo gotchas: Name is the bare label (`services`, not `humanrecords.co.services` — a malformed row
blocked publishing of the whole zone until deleted). Values pasted through chat apps can pick up
invisible non-breaking spaces; verify with `dig +short TXT <name>.humanrecords.co @ns1.cargo.site`.

Checklist (as run; reuse for a dev subdomain or a future move):

1. Back up: screenshot the existing DNS records.
2. Resend: add the domain, add its records, verify; switch the SMTP sender in both Supabase projects
   (now `noreply@humanrecords.co`). Test a code to a non-owner email on develop first.
3. `vercel domains add <host> human-records` (Production), add the record Vercel asks for, wait for HTTPS.
4. Prod bucket CORS: add the origin in `infra/r2/cors.prod.json`, paste into Cloudflare.
5. Vercel Production `SITE_URL`, then redeploy (`gh run rerun <latest main Deploy run>` + Approve).
6. Supabase prod: add `https://<host>/**` redirect, then Site URL.
7. Repo variable `PROD_SITE_URL` (health check).
8. Smoke test: emailed code, invite link starts with the new host, playback.
9. Write and lock NFC cards last.

## NFC cards

From `/admin/users`, copy each person's invite link; it has the form
`https://services.humanrecords.co/login?email=...&invite=...` (the `invites` skill). Write exactly that final-domain URL
to the tag, **verify a tap** opens the welcome screen, then **lock the tag**. Unlocked tags can be
rewritten by anyone's phone. Never write cards on a `*.vercel.app` URL.
