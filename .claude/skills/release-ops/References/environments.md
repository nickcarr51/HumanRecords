# Reference: Environments

| | Local | Develop | Prod |
|---|---|---|---|
| Git branch | any | `develop` | `main` |
| App | `yarn dev` | Vercel Preview for `develop`, fixed alias `humanservices-dev.vercel.app` | Vercel Production, `services.humanrecords.co` |
| Supabase | Docker (`yarn supabase start`) | `HumanRecordsDev` (`vpmloqanmmafchsucgkl`) | `Human Services` (`gglrarflzvfxhdnjbnvt`) |
| R2 bucket | `humanrecords-media-local` | `humanrecords-media-dev` | `humanrecords-media-prod` (locked) |
| R2 token scope | local bucket only | dev bucket only | prod bucket only |
| Email | Mailpit (`http://127.0.0.1:54324`) | Resend | Resend |

One Vercel project (`nick-carrs-projects/human-records`) linked to the GitHub repo; production
branch `main` → `https://services.humanrecords.co` (since 2026-10-09; `https://humanservices.vercel.app`
still serves prod too); `develop` (branch-scoped Preview env vars) →
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
| `DATABASE_URL` (server-only; the Supabase **transaction pooler** URL, port 6543; add before the deploy) | local stack (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) | dev project's transaction pooler URL | prod project's transaction pooler URL |
| `R2_ACCOUNT_ID`, `R2_ENDPOINT` | same | same | same |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | local token | dev token | prod token |
| `R2_BUCKET_NAME` | `humanrecords-media-local` | `humanrecords-media-dev` | `humanrecords-media-prod` |
| `FEED_PAGE_SIZE` (optional) | blank or small (e.g. 3) to test paging | unset | unset |
| `SITE_URL` | `http://127.0.0.1:3000` | develop URL | prod URL |
| `NEXT_PUBLIC_APP_ENV` | `local` | `develop` | `production` |
| `NEXT_PUBLIC_SENTRY_DSN` | blank | DSN | DSN |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | blank | set (source maps at build) | set |

`DATABASE_URL` is the direct Postgres connection the app's Drizzle reads use ([[db-access]]).
Hosted, it goes through Supabase's connection pooler (Supavisor) in "transaction" mode (port 6543),
which shares server connections between transactions; the dashboard's "Transaction pooler"
connection string, with the database password, is the value. Every host except
`127.0.0.1`/`localhost` gets an encrypted connection that also checks the server really is Supabase,
using Supabase's public root certificate kept in the code (`src/lib/db/supabase-ca.ts`, expires
2031-04-26; `connectionOptions` in `src/lib/db/client.ts`). Nothing is configured per environment,
so the dashboard string works as-is; an `sslmode` setting (Postgres's TLS option) in it is not
needed and can't weaken the check. Missing in an environment → the feed, album and admin user/artist
pages fail and the deploy's "Site database answers" step goes red.

The prod R2 token lives only in Vercel Production. The backup token lives only in GitHub.

Not an env var: night mode. The root layout (`src/app/layout.tsx`) reads the `hs-theme` cookie
(`src/lib/theme/mode-cookie.ts`) on every request; no Vercel config is involved.

## Hosted database checks (owner, read-only; local tests can't prove these)

For each hosted project, before the first deploy that uses `DATABASE_URL` and after it. Do (b),
(c) and (g) before the PR that first uses `DATABASE_URL` (into `develop`, then `develop` → `main`),
(h) before each merge, and (a), (d)-(f) right after each deploy.

- **(a)** The pooler's certificate chains to the embedded CA (`src/lib/db/supabase-ca.ts`,
  Supabase Root 2021). Proven when that site's `/api/health/db` answers 200: the app checks the
  certificate before the health check's first query, so one that doesn't chain fails the `query`
  check.
- **(b)** Role timeouts. In the project's SQL editor:
  `select rolname, rolconfig from pg_roles where rolname in ('authenticated', 'authenticator', 'postgres');`
  The 10s per-transaction timeouts assume `authenticated`/`authenticator` have about 8s and
  `postgres` only the 2-minute global cap (`src/lib/db/transaction-setup.ts`).
- **(c)** Time zone: `show timezone;` must be `UTC`, as locally. `pgrstTs` reproduces PostgREST's
  date strings, and their `+00:00` ending depends on it.
- **(d)** The pooler login skips RLS (`asSystem` relies on it).
- **(e)** It can read `auth.users` (`listUsers` relies on it).
- **(f)** It can switch to `authenticated` (`asUser` relies on it). (d)-(f) are also proven by
  `/api/health/db`: its `bypassesRls`, `readsAuthUsers` and `switchesToAuthenticated` checks run as
  the same login the app uses, so a 200 proves all three.
- **(g)** The dashboard's API "Max rows" setting is 1000 (`MAX_ROWS` in `src/lib/db/max-rows.ts`
  matches it).
- **(h)** `DATABASE_URL` is set in that Vercel environment (Preview for develop, Production) before
  the merge: the deploy's "Site database answers" step fails the run without it.

## Hosted Auth settings (both Supabase projects; match `config.toml`)

- Sign-up OFF (Authentication → "Allow new users to sign up").
- Email OTP length 6, OTP expiry 3600.
- Custom `invite` and `magic_link` templates pasted from `supabase/templates/`.
- Site URL and redirect URLs set per environment. Prod Site URL `https://services.humanrecords.co`;
  prod redirects allow both `https://services.humanrecords.co/**` and `https://humanservices.vercel.app/**`.
- Custom SMTP = Resend: host `smtp.resend.com`, port 465, user `resend`, password = Resend API
  key (pasted by the owner). Sender `noreply@humanrecords.co` in both projects (Resend domain
  `humanrecords.co` verified 2026-10-09; DKIM/SPF/DMARC records in Cargo DNS).
- OTP minimum per-email frequency 60s; emails-per-hour cap 30 (protects the Resend quota:
  3,000/month, 100/day on the free plan).

## Sentry

`@sentry/nextjs`, free Developer plan only. Errors only: `tracesSampleRate` 0, the
BrowserTracing / BrowserSession / ProcessSession integrations filtered out by
`src/lib/observability/errors-only-integrations.ts`, `telemetry: false`. Events are tagged by
`NEXT_PUBLIC_APP_ENV`. Never add a payment method.
