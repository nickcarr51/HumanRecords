# Reference: Component catalog

All exported from `@/components` (`src/components/index.ts`). Import from the barrel, not
the folder: `import { Button, Stack } from '@/components'`. The live demo of every primitive
is `/style-guide` (dev only).

Props starting with `$` are **transient** (styled-components doesn't forward them to the
DOM). Plain props on function components (`Button`, `FormField`, `Modal`) are normal React props.

## Typography

| Component | Element | Props | Notes |
|---|---|---|---|
| `Heading` | `h2` | `$level?: 1-4` (default 2) | Size map 1→`4xl`, 2→`2xl`, 3→`xl`, 4→`lg`. Use `as="h1"` to change the tag independently of size. |
| `Text` | `p` | `$variant?: 'body' \| 'muted' \| 'small'` | Display font, line-height 1.6. |
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
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost'`, `size: 'sm' \| 'md' \| 'lg'`, `loading`, + all `<button>` attrs | Mono uppercase. `loading` disables the button, sets `aria-busy`, shows a spinner dot. Default `type` is the browser's (`submit`) — pass `type="button"` for non-submit buttons inside forms. |
| `Link` | styled `<a>` | Accent mono link. **Not** `next/link` — fine for a full-page nav (e.g. `/` → `/login`); for client-side in-app navigation use `styled(Link)` from `next/link` as `AppShell`/`Pagination`/`admin.styles.ts` do. |
| `Tag` | `$tone?: 'default' \| 'accent' \| 'success' \| 'error' \| 'warning' \| 'info'` | Outlined uppercase pill. |
| `Card` | `$interactive?: boolean` | `surface` panel; interactive adds hover lift + accent border. |

## Forms

| Component | Props | Notes |
|---|---|---|
| `Input`, `Textarea`, `Select` | `$invalid?: boolean` + native attrs | All share `fieldStyles` (`src/components/field/fieldStyles.ts`): mono, `bg` fill, accent focus ring, red border when `$invalid`. |
| `Checkbox`, `Radio` | native attrs | `styled.input.attrs({ type })` with custom `appearance: none` visuals. |
| `FormField` | `label`, `htmlFor?`, `hint?`, `error?`, `children` | Label + control + **error (role="alert") replaces hint** when present. Pair `htmlFor` with the control's `id`. |

## Feedback + overlays

| Component | API | Notes |
|---|---|---|
| `Alert` | `$tone?: 'success' \| 'error' \| 'warning' \| 'info'` (default `info`) | Left-bordered box. Add `role="alert"` yourself for errors (login does). |
| `Spinner` | `$size?: string` | Used as Suspense fallback on `/login`. |
| `ToastProvider` + `useToast()` | `notify(message, tone?)` | Auto-dismiss after 4s, fixed bottom-right, `role="status"`. **Not mounted app-wide** — only the style guide wraps itself in one. Mount a provider before calling `useToast()` (it throws outside one). |
| `Modal` | `open`, `onClose`, `label?`, `children` | `role="dialog"` + `aria-modal`; closes on Escape and overlay click. Renders `null` when closed. No focus trap. |

## Chrome

| Component | Notes |
|---|---|
| `Nav`, `NavBrand`, `NavLinks` | Top bar pieces. `AppShell` uses `Nav` + `NavLinks` with its own brand link. |
| `Footer` | Mono uppercase footer (not currently mounted in the app). |

## Composite / feature-owned components

These live in `src/components/` and are barrel-exported, but their behavior belongs to a
feature skill — read that skill before changing them.

| Folder | Owner skill |
|---|---|
| `AppShell/` — nav, Admin link, sign-out, mounts the player | [[timeline-player]] (mount), [[admin-upload]] (Admin link) |
| `Player/` — `PlayerProvider`, `usePlayer`, `PlayerBar`, `toPlayerTrack` | [[timeline-player]] |
| `Feed/` — `FeedList`, `AlbumRow`, `SingleTrackRow`, `AlbumTracks`, `usePlayButton` | [[timeline-player]] |
| `Upload/` — `UploadForm`, `TrackWidget`, `ArtistCombobox`, reducer, engine | [[admin-upload]] |
| `ArtistCard/` — artist list row + re-exported `initials` | [[artists-read]] |
