---
name: head-tags
description: Use when adding or renaming a page (its browser tab title), touching Next.js `metadata` / `generateMetadata`, `src/app/layout.tsx` metadata, Open Graph / Twitter tags, `metadataBase` / `SITE_URL` for link previews, `src/app/icon.png`, `apple-icon.png`, `public/og.png`, `public/icon-192.png` / `icon-512.png`, or `src/app/manifest.ts`. Also when a shared link (iMessage, Slack, WhatsApp) shows no title or image, a tab shows the wrong title, or replacement icon/preview artwork is being prepared.
---

# Head tags: titles, link previews, icons, manifest

Everything a browser tab, a chat-app link preview, or a home-screen install reads. Built on
`feature/downloads` (2026-10-10).

## The one thing to understand first

**The root layout owns every shared tag; pages set only `title`.** `src/app/layout.tsx` exports
`title: { default: 'Human Services', template: '%s · Human Services' }`, the description, `metadataBase`
(from `SITE_URL`), `openGraph` and `twitter`. A page exports `metadata = { title: 'Feed' }` → tab
`Feed · Human Services`. **Never set `openGraph`/`twitter` in a page**: Next replaces (not merges) the
whole object, and previews would lose the image or leak page data (album titles, invitee names) to
logged-out crawlers. Previews always read `Human Services`.
Crawlers are logged out, so they only ever see the root tags on public pages (`/`, `/login`); every
`(app)` page redirects them to `/login`. Per-page previews (album art, titles) are impossible without
making a route public — a separate privacy decision, not a metadata change.

## Quick reference

| Need | Do |
|---|---|
| Static page title | `export const metadata: Metadata = { title: 'Admin · Releases' }` |
| Admin pages | `Admin · <Section>` (`Admin`, `Admin · Users`, `Admin · Upload`) |
| Current titles | `/feed` `Feed`, `/albums/[id]` album title, `/dashboard` `Dashboard`, admin as above |
| Title from data | `generateMetadata` + one `cache()`-wrapped loader shared with the page (see `src/app/(app)/albums/[id]/page.tsx`); missing row → return `{}` (default title) |
| `/login` (incl. invite links) | no title → `Human Services` |
| Absolute OG image URL | `metadataBase` = `SITE_URL`; unset/invalid → silently omitted (build never crashes) |

## Files and sizes (owner replaces artwork in place, same names + sizes)

| File | px | Notes |
|---|---|---|
| `src/app/icon.png` | 512×512 | tab icon (replaced `favicon.ico`) |
| `src/app/apple-icon.png` | 180×180 | **opaque** — iOS fills transparency with black; no rounded corners |
| `public/icon-192.png`, `public/icon-512.png` | 192², 512² | manifest icons (Android install) |
| `public/og.png` | 1200×630 | keep art inside the centred 630×630 (some apps crop square) |

Icons: keep the logo inside the middle 80%. `src/app/manifest.ts`: `start_url: '/'`, `display: 'standalone'`,
colors `palette.bgBase`.

## Logged-out reachability

Crawlers fetch logged out. `*.png` is excluded by the matcher in `src/middleware.ts`;
`/manifest.webmanifest` isn't in `PROTECTED_PREFIXES` ([[auth]]). A new asset type (`.ico`, `.svg` under a
protected path, `.webmanifest` elsewhere) must stay outside both.

## Debugging "no preview"

1. `curl -s '<SITE_URL>/login?invite=x' | grep -oE '<meta (property|name)="(og|twitter):[^>]*>'` — `og:image` must be absolute.
2. Relative or `127.0.0.1` → `SITE_URL` wrong in that Vercel environment ([[invites]], [[release-ops]]).
3. `curl -sI <SITE_URL>/og.png` → 200 `image/png`; 307 → middleware matcher.
4. 401 / SSO redirect on `/login` → Vercel deployment protection blocks crawlers.
5. All fine → the chat app cached an old unfurl; re-paste later.

## Common mistakes

- Adding `openGraph` to a page "for a better preview" — wipes the root image; leaks data.
- Writing `title: 'Feed · Human Services'` in a page — doubles the suffix.
- Fetching the same row twice for `generateMetadata` and the page — share a `cache()` loader.
- Transparent `apple-icon.png` — black corners on iPhone.

## Tests

`src/app/layout.test.tsx` (template, OG/Twitter, `metadataBase` fallback), page `metadata` assertions in
admin page tests, `src/app/(app)/albums/[id]/page.test.tsx` (`generateMetadata`), `src/app/manifest.test.ts`.

## Depends on

- [[auth]] — middleware matcher + `PROTECTED_PREFIXES`.
- [[invites]] — invite links are the main shared URL; `SITE_URL`.
- [[component-library]] — `palette` tokens used by the manifest.
