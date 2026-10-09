# Listener Timeline + Persistent Player Design

**Date:** 2026-09-28
**Status:** Approved (brainstorm), pending implementation plan
**Branch:** `feature/media-player-and-refactor` → PR into `develop`

## Goal

Give a signed-in listener a single chronological timeline of the label's
music and a music player that persists through in-app navigation
(SoundCloud-style): select a track, play/pause, scrub, next/previous,
and keep playing while browsing the rest of the site.

This spec covers the **listener** experience only. The **admin portal**
(track/album/artist management + sending invites) is a separate future
spec and is explicitly out of scope here.

## MVP context (why this exists)

After a team decision the V1 was downsized to a **single timeline of
music the label controls**. The catalog schema is intentionally *not*
gutted — V1 simply uses less of it. Three roles remain planned
(listener / artist / label_member); for now only listeners and label
members use the site, and no role logic is enforced yet (reads are gated
by the existing "authenticated" RLS policies). Nothing in this spec adds
role logic.

## Success criteria

**Session deliverable (first implementation slice):**
- A signed-in user lands on the timeline and sees exactly **two items**:
  one standalone track and one album containing two tracks.
- Clicking any of the **three** tracks plays it in the player.
- The player keeps playing the same track while the user navigates
  within the app.

**Full spec scope (may span more than one session):** everything in
Architecture below, including the album page and expandable album rows.

## Non-goals / explicit cuts

- **Refresh-resume.** Playback persists across in-app navigation only
  (free with the App Router layout). A hard browser refresh resets the
  player. sessionStorage-based resume is a later enhancement.
- **Working search.** A search bar appears at the top of the timeline in
  the design, but wiring it to filter results is **deferred from the
  session deliverable**. It is described here so it is a deliberate cut,
  not an omission.
- **Admin portal & invites.** Separate future spec.
- **Role enforcement.** Not in this spec.
- **New migrations / hosted-DB changes.** The feed is built from the
  existing schema; see Data Layer.

## Architecture

### Persistence mechanism

A client `PlayerProvider` (React context) is mounted inside `AppShell`,
which lives in the `(app)` route-group layout
(`src/app/(app)/layout.tsx`). Next.js App Router keeps a route-group
layout mounted while the user navigates between routes inside that group,
so the single `<audio>` element and all player state never unmount during
in-app navigation. No global state library and no refresh-rehydration are
required. The reserved slot already noted in `AppShell` ("between the nav
and the universal player") is where the player bar renders.

### Data flow

```
User clicks play on a row
  → usePlayer().playQueue(tracks, startIndex)
    → PlayerProvider sets { queue, currentIndex, status: "loading" }
      → effect calls getTrackStreamUrl(currentTrack.id)   (existing server action)
        → audio.src = signedUrl; audio.play()
          → audio events update currentTime / duration / isPlaying
          → "ended" → next()  → refetch signed URL for the next track
PlayerBar renders from context; its controls call context actions.
```

Signed stream URLs are the existing 2h R2 URLs from
`src/lib/storage/actions.ts::getTrackStreamUrl`, which signs whatever key
is stored in `tracks.audio_url`. **`tracks.audio_url` must hold the R2
object key** (path within `humanrecords-media-dev`, e.g.
`tracks/<id>/audio.mp3`), not a public URL, and the object must exist at
that key.

## Components and units

### `PlayerProvider` (client) — `src/components/Player/PlayerProvider.tsx`
- **Does:** owns one `<audio>` ref and all player state; fetches signed
  URLs; exposes actions via context.
- **State:** `queue: PlayerTrack[]`, `currentIndex: number`,
  `isPlaying: boolean`, `currentTime: number`, `duration: number`,
  `status: "idle" | "loading" | "playing" | "error"`.
- **Actions:** `playQueue(tracks, startIndex)`, `toggle()`, `next()`,
  `prev()`, `seek(seconds)`.
- **`PlayerTrack` shape** (minimal, view-ready — the caller resolves
  titles/artists so the provider never re-queries):
  `{ id: string; title: string; artistName: string }`.
- **Behavior:** on `currentIndex`/`queue` change, sets `status:"loading"`,
  calls `getTrackStreamUrl(track.id)`; on success sets `audio.src` and
  plays; on `{error}` or an `<audio>` `error` event sets `status:"error"`.
  `ended` advances via `next()`; `next()` past the end stops. `prev()`
  before index 0 stays at 0 (or restarts current — implementer's call,
  documented in plan).
- **Depends on:** `getTrackStreamUrl` (`@/lib/storage/actions`).

### `usePlayer()` hook
Exported from the provider module; throws if used outside the provider.

### `PlayerBar` (client) — `src/components/Player/PlayerBar.tsx`
- **Does:** presentational bottom bar. Shows current title + artist,
  play/pause, prev/next, a scrubber (range input bound to
  `currentTime`/`duration`, calls `seek`), and elapsed/total time.
- **Empty state:** renders nothing (or a slim idle bar) when `queue` is
  empty.
- **Error state:** shows a short inline message when `status === "error"`.
- **Depends on:** `usePlayer()`. Uses existing theme tokens + component
  library only (styled-components).

### Feed data layer — `src/lib/supabase/feed.ts`
- **`getFeed(supabase, opts?: { page?: number; pageSize?: number }): Promise<FeedPage>`**
- **`FeedItem`** is a discriminated union:
  - `{ kind: "album"; id; title; albumArtUrl; artistNames: string[]; createdAt; tracks: FeedTrack[] }`
  - `{ kind: "track"; id; title; trackArtUrl; artistNames: string[]; createdAt }`
- **`FeedTrack`** = `{ id; title; artistNames: string[] }`.
- **`FeedPage`** = `{ items: FeedItem[]; page; pageSize; hasMore: boolean }`.
- **Approach (bare bones, no migration):** query recent albums (joined to
  their tracks via `track_albums` and to artist names via `album_artists`
  → `artists`) and recent **standalone tracks** (tracks with no
  `track_albums` row, joined to `track_artists` → `artists`); merge in
  memory by `createdAt` descending; slice to the requested page;
  `hasMore` from whether a merged item remains past the slice.
- **Standalone detection:** a track absent from `track_albums`. Implement
  via a left-join/`not`-style filter or by excluding album track ids;
  exact query decided in the plan and covered by tests.
- **Upgrade note (not built now):** when volume grows, replace the
  in-memory merge with a `feed_items` SQL view (union of albums +
  standalone tracks with a common `created_at` and `kind`) for honest
  SQL pagination.
- **Depends on:** `SupabaseClient<Database>` (dependency-injected, first
  arg — matches `artists.ts` convention).

### Routes / pages

- **`/feed`** — `src/app/(app)/feed/page.tsx`, server component. Calls
  `createClient()` → `getFeed` → renders `FeedList`. New authenticated
  home.
- **`/albums/[id]`** — `src/app/(app)/albums/[id]/page.tsx`, server
  component, bare bones: album title + art + track list; each track row
  plays through the persistent player. `notFound()` for a missing id.
- **`/artists` goes dark** — preserve the existing files; add a
  `redirect('/feed')` so the routes are unreachable for now. Remove the
  Artists link from `AppShell` nav; point the brand logo to `/feed`.

### Feed components — `src/app/(app)/feed/` (or `src/components/Feed/`)
- **`FeedList`** — maps `FeedItem[]` to rows; wraps everything client-side
  enough to use `usePlayer()`.
- **`SingleTrackRow`** — title + artist + play button →
  `playQueue([track], 0)`.
- **`AlbumRow`** — title/art + expand toggle. Collapsed: shows album meta.
  Expanded (bare bones): lists tracks, each `playQueue(albumTracks, i)`; a
  "play album" control (`playQueue(albumTracks, 0)`); a link to
  `/albums/[id]`.
- **`SearchBar`** — present at top of feed, **not wired this session**
  (deferred cut). Included so layout accounts for it.

### Routing / guard change — `src/lib/auth/route-guard.ts`
Authenticated users hitting `/` or `/login` currently redirect to
`/dashboard`; retarget to `/feed`. `/dashboard` remains reachable by URL
but is dropped from primary navigation intent (no nav link change
required beyond removing Artists; brand → `/feed`).

## Error handling

- `getTrackStreamUrl` returns `{ url, error }` (never throws to the
  client); provider maps a non-null `error` to `status:"error"`.
- A missing/expired R2 object surfaces as an `<audio>` `error` event →
  `status:"error"`; PlayerBar shows a short message, no crash.
- `getFeed` propagates Supabase errors to the server component, which
  renders an empty/error state rather than throwing a 500.
- Album page: unknown id → `notFound()`.

## Testing

- **`feed.ts`** — data test (requires local Supabase, `.data.test.ts`
  convention): merged items are chronological desc; an album carries its
  tracks and artist names; a standalone track is `kind:"track"` and never
  appears twice; pagination respects `pageSize`/`hasMore`.
- **`PlayerProvider`** — unit test with `getTrackStreamUrl` mocked and
  `HTMLMediaElement.prototype.play`/`pause` stubbed (jsdom lacks them):
  `playQueue` sets the current track and requests its URL; `toggle` flips
  `isPlaying`; `next`/`prev` move `currentIndex`; `ended` advances; an
  error result sets `status:"error"`.
- **`PlayerBar`** — renders current track; controls call the mocked
  context actions; scrubber calls `seek`; empty and error states render.
- **`SingleTrackRow` / `AlbumRow`** — render; play controls call
  `playQueue` with the right queue + index; album expands.
- **`route-guard`** — authed landing on `/` and `/login` → `/feed`;
  `/artists` redirect covered where practical.

## Seed data — `supabase/seed.sql`

Rework the demo data:
- **Remove** the bulk ~30-artist browse dataset (added for `/artists`,
  which is going dark; the `artists.data` tests self-seed and are
  unaffected).
- **Keep** the three seed accounts (`listener@`, `artist@`,
  `label@example.com`).
- **Add** the demo dataset — values **provided by the user**:
  - 3 artists (names TBD).
  - 1 album (title TBD) containing 2 tracks (titles TBD), each track
    credited to an artist.
  - 1 standalone track (title TBD), credited to the third artist.
  - Each track's `audio_url` = its **R2 object key** (TBD), for files the
    user uploads to `humanrecords-media-dev`.
- `created_at` values ordered so the timeline shows a sensible mix of the
  album and the single track.

## Open items to collect from user before the play path works end-to-end

1. Three artist names.
2. Album title + its two track titles; the standalone track title.
3. Which artist is credited to each of the three tracks.
4. The three R2 object keys (files uploaded to `humanrecords-media-dev`).

The timeline + player UI can be built and tested against placeholder keys
before these arrive; real audio playback depends on items 1–4.
