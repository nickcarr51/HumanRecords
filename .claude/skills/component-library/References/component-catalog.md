# Reference: Component catalog

The primitives are exported from `@/components` (`src/components/index.ts`). Import those
from the barrel, not the folder: `import { Button, Stack } from '@/components'`. The live demo
of the primitives is `/style-guide` (dev only; it predates the design pass, see Known gaps).
The effect and catalog components further down are **not** in the barrel — import them by
path (`@/components/Player/SweepIcon`, `@/components/CatalogId/CatalogLine`, …).

Props starting with `$` are **transient** (styled-components doesn't forward them to the
DOM). Plain props on function components (`Button`, `FormField`, `Modal`, `PlaybackButton`)
are normal React props. Everything reads the current mode's theme; where a component changes
*behaviour* by mode it's noted.

## Typography

| Component | Element | Props | Notes |
|---|---|---|---|
| `Heading` | `h2` | `$level?: 1-4` (default 2) | **Display font = `fonts.display` (Arial/Helvetica)**, bold, `-0.045em` tracking, line-height 1.1. Size map 1→`4xl`, 2→`2xl`, 3→`xl`, 4→`lg`. Use `as="h1"` to change the tag independently of size. |
| `Text` | `p` | `$variant?: 'body' \| 'muted' \| 'small'` | Mono font (Dico Mono), line-height 1.6. |
| `Mono` | `span` | — | Inline mono text (emails, codes, labels). |

## Layout

| Component | Element | Props | Notes |
|---|---|---|---|
| `Container` | `div` | `$max?: string` (default `1024px`) | Centered, `lg` side padding. |
| `Section` | `section` | — | `xxl` vertical padding. |
| `Stack` | `div` | `$gap?: SpaceKey` (default `md`) | Vertical flex. |
| `Row` | `div` | `$gap`, `$align` (`center`), `$justify` (`flex-start`), `$wrap` | Horizontal flex. |
| `Grid` | `div` | `$cols?`, `$gap?`, `$min?` (`220px`) | Fixed `$cols` or auto-fill `minmax($min, 1fr)`. |
| `Divider` | `hr` | — | Border-colored rule. |

## Actions + links

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost'`, `size: 'sm' \| 'md' \| 'lg'`, `loading`, + all `<button>` attrs | Mono uppercase, square corners (`radii.sm` = 0). **Primary text branches on `theme.mode`**: `text` on `accent` in day, `bg` on `accent` in night. `loading` disables the button, sets `aria-busy`, shows a spinner dot. Default `type` is the browser's (`submit`) — pass `type="button"` for non-submit buttons inside forms. Its look is exported as `buttonStyles` (a `css` block taking `$variant`/`$size`) so other elements can match it; `:disabled` styling is not included, since a `<label>` can't be disabled. |
| `Link` | styled `<a>` | Mono, `text`-colored 1px bottom border that turns `accent` on hover, and **`textSweepStyles`** (accent sweeps through the text on hover/focus; forced-colors fallback included). **Not** `next/link` — fine for a full-page nav (e.g. `/` → `/login`); for client-side in-app navigation use `styled(Link)` from `next/link` as `AppShell`/`Pagination`/`admin.styles.ts` do, and add `textSweepStyles` yourself to match. |
| `Tag` | `$tone?: 'default' \| 'accent' \| 'success' \| 'error' \| 'warning' \| 'info'` | Outlined uppercase label, square. `accent` fills with `accent` and (like `Button`) picks `text`/`bg` ink by `theme.mode`. Non-accent tones map to the matching `theme.colors.*`, which in this palette are mostly `text`/`muted`/burnt orange — see Known gaps. |
| `Card` | `$interactive?: boolean` | `surface` panel (same hex as `bg`; the `border` is what you see); interactive adds hover lift + accent border. |

## Forms

| Component | Props | Notes |
|---|---|---|
| `Input`, `Textarea`, `Select` | `$invalid?: boolean` + native attrs | All share `fieldStyles` (`src/components/field/fieldStyles.ts`): mono, `bg` fill, accent focus ring, `error`-colored border when `$invalid`. `Input` also restyles `::-webkit-search-cancel-button` as a `text`-colored masked ×, so `type="search"` matches the theme in both modes. |
| `FileInput` | `id` (required), `buttonLabel?` (default "Choose file"), `variant?`/`size?` (Button's), `$invalid?`, + native `<input>` attrs except `type` | The native file input is visually hidden but stays focusable. A `<label>` styled with `buttonStyles` (primary by default) is what people click. Focus ring and disabled look come from `input:focus-visible + label` / `input:disabled + label`; `$invalid` adds a red outline and `aria-invalid`. The chosen file name isn't shown, so put it in the `FormField` hint. Used by `TrackWidget`. |
| `Checkbox`, `Radio` | native attrs | `styled.input.attrs({ type })` with custom `appearance: none` visuals. |
| `FormField` | `label`, `htmlFor?`, `hint?`, `error?`, `children` | Label + control + **error (role="alert") replaces hint** when present. Pair `htmlFor` with the control's `id`. |

## Feedback + overlays

| Component | API | Notes |
|---|---|---|
| `Alert` | `$tone?: 'success' \| 'error' \| 'warning' \| 'info'` (default `info`) | Left-bordered box. Add `role="alert"` yourself for errors (login does). |
| `Spinner` | `$size?: string` | Used as Suspense fallback on `/login` and inside `DownloadButton` while signing. |
| `ToastProvider` + `useToast()` | `notify(message, tone?)` | Auto-dismiss after 4s, fixed bottom-right (lifted by `--toast-offset`), `role="status"`. Mounted once in `AppShell`, so any `(app)` page can `useToast()`; the style guide wraps itself in its own. Outside a provider `useToast()` throws; `useOptionalToast()` returns `null` instead (used by `DownloadButton`, which falls back to `console.error`). |
| `Modal` | `open`, `onClose`, `label?`, `children` | `role="dialog"` + `aria-modal`; closes on Escape and overlay click. Renders `null` when closed. No focus trap. Overlay is a hard-coded `rgba(0,0,0,0.6)` (Known gaps). |

## Chrome

| Component | Notes |
|---|---|
| `Nav`, `NavBrand`, `NavLinks` | Top bar pieces; `bg` fill, `border` bottom rule; stack vertically at ≤`sm`. `AppShell` uses `Nav` + `NavLinks` with its own brand link (display-font "Human Services" + mono "by Human Records"), the **day/night toggle** (`PlayButton` with a `SweepIcon` sun/moon, `aria-pressed`, `useThemeMode().toggle`), the Admin link and Sign out (both `textSweepStyles`). |
| `Footer` | Mono uppercase footer (not currently mounted in the app). |

## Catalog stamps (`src/components/CatalogId/`, not barrel-exported)

| Component | Props | Notes |
|---|---|---|
| `CatalogId` | `kind: 'album' \| 'track'`, `number?: number` | Renders the permanent catalog code — `HS001` for albums, `HSS012` for tracks (zero-padded to 3 digits, grows past 999) — as a small letter-spaced mono `muted` stamp with `aria-label="Album catalog HS001"`. Returns `null` for a missing/invalid number, so it's safe to render unconditionally. Used in `PlayerBar`'s meta and the album page header. The numbers come from `catalog_number` ([[catalog-schema]]). |
| `CatalogLine` | `kind`, `number?`, `issuedAt?` (ISO string), `slot?`, `total?` | `CatalogId` + `ISSUED 2026.10.11` (`<time dateTime>`) + `TRACK 02 / 10` or `TRACKS 10`, separated by `border` left rules; at ≤`sm` only the stamp shows. Invalid dates are skipped. Used by `AlbumRow`, `SingleTrackRow`, `AlbumTracks` ([[timeline-player]]). |

## Icons + playback controls (`src/components/Player/`, not barrel-exported)

| Component | Props | Notes |
|---|---|---|
| `SweepIcon` | `SVGProps<SVGSVGElement>` (`fill`, `stroke`, `strokeWidth`, `width`…) + SVG children | 18×18 `aria-hidden` SVG (viewBox 24) that draws its children twice; the second copy is `accent`-colored and clipped by a rect scaled by `var(--hover-progress)`, so an ancestor carrying `iconSweepStyles` reveals accent left-to-right on hover/focus. Children: plain shapes using `currentColor`, no `id`s. Wrap with `styled(SweepIcon)` for extra transforms (the `AlbumRow` chevron). Used by `PlaybackIcon`, `PlayerBar` prev/next, `AlbumRow` (chevron, open-pack arrow), `DownloadButton`, the `AppShell` theme toggle. |
| `PlaybackIcon` | `playing: boolean` | Play triangle or pause bars inside a `SweepIcon` with `fill="currentColor"`. The enclosing button supplies the circle and the `aria-label`. |
| `PlaybackButton` | `active: boolean` + all `<button>` attrs | A `PlayButton` (from `Feed/feed.styles`) wrapped in a `Shell`: when `active` it turns `accent` with an inset glow (`withAlpha(accent, 0.086)`), an accent radial halo (`::before`, `withAlpha` stops) fades in, and a 130px canvas emits 2px accent pixels driven by `useAudioMeter()` (Web Audio RMS). Skips the canvas under reduced motion or when no meter is provided. Used for every play/pause control: feed rows, `AlbumTracks`, `PlayerBar`. Mechanics: [[visual-effects]]. |
| `PixelWaveform` | `playing: boolean`, `status: string` | Status word (`Playing` / `Paused` / `Loading` / `Error`) + a 96×24 canvas (36px wide at ≤`sm`) of 32 dot columns sampled from `useAudioWaveform()` at 30fps while playing; a static `faint` baseline when paused. `accent`-colored. Lives in `PlayerBar`'s controls. |

## Ambient effects (not barrel-exported; conventions in [[visual-effects]])

| Component | Props | Notes |
|---|---|---|
| `CRTTexture` (`CRTTexture/`) | — | Two fixed, full-viewport, `pointer-events: none` divs at `zIndex.toast + 1`: `Scanlines` (CSS wash + 1 px scanlines every 4 px + radial vignette from `theme.effects.ink` / `.vignette`, painted once; `opacity` pulse on desktop) and `Band` (the occasional tracking sweep, moved by `element.animate()` on the compositor, with an SVG `feDisplacementMap` backdrop filter — Chrome/Firefox only). Stronger scanlines in night (`theme.mode`). **Mounted exactly once in `src/app/layout.tsx` inside the registry** — never mount it in a page. No render loop; static under reduced motion; timer and pulse stop while the tab is hidden. |
| `GlitchArt` (`GlitchArt/`) | `src`, `alt`, `className?` | An `<img>` (plain, not `next/image`) with an overlay canvas that draws a few horizontal torn slices of the same image while hovered. Style it with `styled(GlitchArt)` (`ArtistCard`'s `Thumb`; the album page's `Art`). **Kept but not rendered on the album page** until image upload ships — `album_art_url` is an unsigned R2 key, so `Head` is single-column for now (see the comment in `albums/[id]/page.tsx`). |
| `SignInGlitch` (`Login/SignInGlitch.tsx`) | `children` | Wraps children in a `<div>` and, in random bursts (first after 6–14s, then every 18–35s), applies an SVG displacement filter + a sub-pixel `translateX`/`skewX` for a few 35–90ms steps. It never duplicates the DOM, so a focused input keeps focus and value. Idle while the tab is hidden or under reduced motion. Used around the logo and heading on `/` and the whole form on `/login`. |
| `PixelAccordion` (`Feed/PixelAccordion.tsx`) | `open: boolean`, `id: string`, `children` | Collapsible panel: `grid-template-rows 0fr ↔ 1fr` over 420ms, `aria-hidden` + `inert` when closed; `id` must match the trigger's `aria-controls`. **Children are unmounted ~450ms after close** (`CLOSE_MS`, immediately under reduced motion) so collapsed track lists don't subscribe to the player and re-render during playback — don't keep state inside the panel that must survive a collapse. On each open/close it appends a `position: fixed` canvas to `document.body` (escaping the feed's internal scroll clip) and emits `theme.effects.particle` pixels from the panel's bottom edge, removing the canvas when they die. Used by `AlbumRow` ([[timeline-player]]). |

## Hover mixins (`src/components/field/hoverStyles.ts`)

Not components but part of the catalog: `textSweepStyles` (links/text), `textHoverState`
(parent-hovers-child), `iconSweepStyles` (round icon controls). Full description in
[styling-conventions.md](styling-conventions.md) §5–6. `Feed/feed.styles.ts`'s
`circularControlStyles` (→ `PlayButton`, `AlbumLink`) and `PlayerBar`'s `IconButton` are the
canonical round-control recipe: `border: 1px solid border; border-radius: pill; 2.25rem;
${iconSweepStyles}`.

## Composite / feature-owned components

These live in `src/components/` and are barrel-exported, but their behavior belongs to a
feature skill — read that skill before changing them.

| Folder | Owner skill |
|---|---|
| `AppShell/` — nav, theme toggle, Admin link, sign-out, mounts `ToastProvider`, `PlayerProvider` and `PlayerBar` | [[timeline-player]] (player mount), [[admin-upload]] (Admin link); the toggle is this skill ([theme-mode.md](theme-mode.md)) |
| `Player/` — `PlayerProvider`, `usePlayer`, `usePlayerTime`, `PlayerBar`, `toPlayerTrack`, `queue.ts`, `useMediaSession`, `audioMeter.ts` | [[timeline-player]]; `audioMeter`, `PlaybackButton`, `PixelWaveform` mechanics in [[visual-effects]] |
| `Feed/` — `FeedList`, `AlbumRow`, `SingleTrackRow`, `AlbumTracks`, `usePlayButton`, `FollowPlayingPage`, `feed.styles` (`PlayButton`, `AlbumLink`, `Row`…) | [[timeline-player]] |
| `Downloads/` — `DownloadsProvider`, `useDownloads` (`isDownloaded`, `markDownloaded`; no-op fallback outside a provider), `DownloadButton` (`PlayButton` + `SweepIcon` arrow; `Spinner` while signing, `aria-busy`; check icon once downloaded) | [[timeline-player]], [[media-storage]] |
| `Upload/` — `UploadForm`, `TrackWidget`, `ArtistCombobox`, reducer, engine | [[admin-upload]] |
| `AdminReleases/` — release list/edit admin | [[admin-upload]] |
| `AdminArtists/` — `ArtistsTable`, `ArtistForm`, `UserCombobox` (single-pick user search), `DeleteArtist`, `admin-artists.styles` (`Danger` section) | [[admin-upload]] |
| `AdminUsers/` — `NewUserForm`, `UsersTable`, `RoleSelect`, `InviteCell` (`disabled`), `UserForm`, `ActiveToggle`, `users.styles` (`Table`: stacked cards below `md`; `td[data-label]` shows a label on phones) | [[invites]] |
| `Login/` — `LoginForm`, `InviteWelcome` (barrel); `SignInGlitch` (by path) | [[auth]], [[invites]] |
| `ArtistCard/` — artist list row (display-font `Name` with `textSweepStyles`, `GlitchArt` thumb or initials `Tile`) + re-exported `initials` | [[artists-read]] |
| `SearchInput/` — debounced URL search box (`initialQuery`, `label?`) | [[artists-read]] (used by `/artists`, `/admin/artists` and `/feed`) |
| `Pagination/` — prev/next pager (`basePath`, `query`, `page`, `totalPages`; `PageLink` = `styled(next/link)` + `textSweepStyles`) + `pageHref` (plain module, server-safe) | [[artists-read]] (used by `/artists`, `/admin/artists` and `/feed`) |
