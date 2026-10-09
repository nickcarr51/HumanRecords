# Reference: Route protection + redirects

## Middleware

`src/middleware.ts` runs `updateSession(request)` on every path except `_next/static`,
`_next/image`, `favicon.ico`, and image files (`svg|png|jpg|jpeg|gif|webp`).

`updateSession` (`src/lib/supabase/middleware.ts`):
1. Builds a server client whose cookie adapter reads from the request and writes to **both**
   the request and a fresh `NextResponse.next({ request })`.
2. `await supabase.auth.getClaims()` — validates the JWT and refreshes the session if needed.
   **Nothing may run between `createServerClient` and `getClaims()`** (Supabase's warning:
   users get randomly logged out).
3. `authRedirectPath(pathname, Boolean(claims))`. If it returns a path: clone the URL, set
   the pathname, clear the query, and for `/login` add `?next=<original pathname>`. Copy every
   cookie from `supabaseResponse` onto the redirect response (otherwise a refreshed token is
   lost).
4. Otherwise return `supabaseResponse` **as is** — returning a different response without
   copying cookies desyncs browser and server sessions.

## `authRedirectPath(pathname, isAuthed)` (`src/lib/auth/route-guard.ts`)

Pure function, evaluated in this order:

| Condition | Result |
|---|---|
| Path is (or is under) a `PROTECTED_PREFIXES` entry and signed out | `/login` |
| Signed in and path is `/artists` or `/artists/*` (retired) | `/feed` |
| Signed in and path is `/` or `/login` | `/feed` |
| Anything else | `null` (no redirect) |

`PROTECTED_PREFIXES = ["/dashboard", "/artists", "/feed", "/albums", "/admin"]`. Matching is
`pathname === p || pathname.startsWith(p + "/")`, so `/feedback` is **not** protected by
`/feed`.

Public routes: `/`, `/login`, `/auth/confirm`, `/style-guide` (dev only), and any unmatched
path (→ 404 page).

## The `?next=` round trip

Middleware → `/login?next=/albums/123` → `LoginForm` reads `next` → `submitOtp(…, next)` →
`redirect(safeNextPath(next))`. `/auth/confirm` also honors `?next=`, but the email templates
don't pass it today — so the code path keeps the destination and the magic link always lands on
`/feed`.

`safeNextPath(raw)` (`src/lib/auth/safe-next.ts`): returns `raw` only if it starts with a
single `/` and not `//` or `/\` (both are protocol-relative to a browser); otherwise `/feed`.

## Server-side guards (defense in depth)

- `src/app/(app)/layout.tsx` — `getSessionUser()` → `redirect('/login')` if null; then
  `getCurrentRole()` for the navbar Admin link. Every route in `(app)` inherits this.
- `src/app/(app)/dashboard/page.tsx` — re-checks the session itself (legacy page, still
  reachable by URL).
- Admin: `requireLabelMember()` in `admin/layout.tsx` **and** every admin `page.tsx` (layouts
  don't re-run on client navigation). See [[admin-upload]] `References/access-control.md`.
- Server actions: each one calls `getSessionUser()` (or `isLabelMember()`) first — they are
  public POST endpoints regardless of which page renders them.

## 404 bounce

`src/app/not-found.tsx`: signed-in → `redirect('/feed')`; signed-out → plain 404. So
`notFound()` from any page (bad album id, non-member on `/admin`) sends a member to `/feed`
without revealing whether the route exists.

## Adding a protected route

1. Put the page under `src/app/(app)/` (inherits the session guard + AppShell + player).
2. Add its prefix to `PROTECTED_PREFIXES` so signed-out users get `/login?next=` instead of a
   server redirect without `next`.
3. Add a case to `route-guard.test.ts`.
4. Role-gated? Call a gate like `requireLabelMember()` at the top of the page **and** in every
   server action it uses.
