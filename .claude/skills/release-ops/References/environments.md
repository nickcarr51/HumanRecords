# Reference: Environments

| | Local | Develop | Prod |
|---|---|---|---|
| Git branch | any | `develop` | `main` |
| App | `yarn dev` | Vercel Preview for `develop`, fixed alias; later `dev.<domain>` | Vercel Production; later `<domain>` |
| Supabase | Docker (`yarn supabase start`) | `HumanRecordsDev` (`vpmloqanmmafchsucgkl`) | `Human Services` (`gglrarflzvfxhdnjbnvt`) |
| R2 bucket | `humanrecords-media-local` | `humanrecords-media-dev` | `humanrecords-media-prod` (locked) |
| R2 token scope | local bucket only | dev bucket only | prod bucket only |
| Email | Mailpit (`http://127.0.0.1:54324`) | Resend | Resend |

One Vercel project (`nick-carrs-projects/human-records`) linked to the GitHub repo; production
branch `main` → `https://humanservices.vercel.app`; `develop` (branch-scoped Preview env vars) →
`https://humanservices-dev.vercel.app`. `vercel.json` sets `git.deploymentEnabled: false`, so NO
branch deploys on push — feature branches get no preview sites (decided 2026-10-06); develop and
main deploy only via `deploy.yml`'s deploy hooks. Free Supabase pauses after
7 idle days; the daily `health.yml` ping prevents it (see pipeline.md for the 60-day catch).

## Vercel env-var matrix

Entered by the owner in the dashboard; secrets never pass through Claude.

| Variable | Local | Develop (Preview, develop) | Prod (Production) |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | local stack | dev project | prod project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | local | dev | prod |
| `SUPABASE_SECRET_KEY` | local | dev | prod |
| `R2_ACCOUNT_ID`, `R2_ENDPOINT` | same | same | same |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | local token | dev token | prod token |
| `R2_BUCKET_NAME` | `humanrecords-media-local` | `humanrecords-media-dev` | `humanrecords-media-prod` |
| `SITE_URL` | `http://127.0.0.1:3000` | develop URL | prod URL |
| `NEXT_PUBLIC_APP_ENV` | `local` | `develop` | `production` |
| `NEXT_PUBLIC_SENTRY_DSN` | blank | DSN | DSN |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | blank | set (source maps at build) | set |

The prod R2 token lives only in Vercel Production. The backup token lives only in GitHub.

## Hosted Auth settings (both Supabase projects; match `config.toml`)

- Sign-up OFF (Authentication → "Allow new users to sign up").
- Email OTP length 6, OTP expiry 3600.
- Custom `invite` and `magic_link` templates pasted from `supabase/templates/`.
- Site URL and redirect URLs set per environment (change at domain cut-over).
- Custom SMTP = Resend: host `smtp.resend.com`, port 465, user `resend`, password = Resend API
  key (pasted by the owner). Sender `onboarding@resend.dev` until the domain is verified; that
  sender delivers only to the Resend account owner, so real invitees cannot receive codes yet.
- OTP minimum per-email frequency 60s; emails-per-hour cap 30 (protects the Resend quota:
  3,000/month, 100/day on the free plan).

## Sentry

`@sentry/nextjs`, free Developer plan only. Errors only: `tracesSampleRate` 0, the
BrowserTracing / BrowserSession / ProcessSession integrations filtered out by
`src/lib/observability/errors-only-integrations.ts`, `telemetry: false`. Events are tagged by
`NEXT_PUBLIC_APP_ENV`. Never add a payment method.
