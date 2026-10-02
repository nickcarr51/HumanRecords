# Reference: The upload form

Files: `src/components/Upload/{upload-reducer.ts, artist-options.ts, ArtistCombobox.tsx,
TrackWidget.tsx, KindToggle.tsx, UploadForm.tsx, upload.styles.ts}`. Page:
`src/app/(app)/admin/upload/page.tsx`.

## State (`upload-reducer.ts`)

```ts
UploadState = {
  kind: "single" | "album";
  album: { title; artists: ArtistChip[] };
  tracks: TrackDraft[];            // order = published position
  publishing: boolean;
  formError: string | null;        // top banner
  showErrors: boolean;             // field errors visible after first Publish
};
TrackDraft = { clientId; title; titleTouched; file: File | null; fileError;
               artists: ArtistChip[];
               upload: { status: "idle"|"uploading"|"done"|"error"; progress; key; error } };
ArtistChip = { key: string; id: string | null; name: string };
```

The reducer is pure: new track ids arrive on the action (`addTrack`, `clear`), generated
by `crypto.randomUUID()` in `UploadForm`.

## Actions and rules

- `setKind`: same kind → no-op. single → album keeps the track as Track 1 (you then add a
  second). album → single keeps Track 1 and drops other tracks + album title/artists.
  `needsKindConfirm` makes `UploadForm` confirm only when that would lose something.
- `setAlbumTitle`, `add/remove/moveAlbumArtist`, `add/remove/moveTrackArtist`.
- `addTrack`, `removeTrack` (never removes the last track), `moveTrack` (±1, clamped).
- `setTrackTitle`: sets `titleTouched` when non-blank (clearing it re-enables auto-fill).
- `setTrackFile`: runs `audioFileError`; if the title is untouched and the file is valid,
  auto-fills the title via `titleFromFilename` (strip extension, `_` → space); **resets the
  upload to idle**.
- `uploadStarted/Progress/Done/Failed`: per-track upload status.
- `publishStarted` (no-op if already publishing; clears banner; shows errors),
  `publishFailed` (stops publishing; sets banner), `showErrors`, `clear` (fresh single).

Selectors: `isDirty` (anything typed/chosen/added), `pendingNewArtists`, `validate`,
`hasErrors`, `buildPayload(state, keys)` (throws if a track has no key; omits `album` for
a single; chips → `{id}` or `{newName}`).

## Chip identity

- Existing artist: `existingChip(match)` → `key: "id:<uuid>"`, `id` set.
- New artist: `newChip(name)` → `key: "new:<normalizeName(name)>"`, `id: null`, `name`
  trimmed. `normalizeName` = `trim().toLowerCase()`, mirroring the DB's
  `lower(trim(name))` index.
- `addChip` ignores a chip whose key **or** normalized name is already on that field.

## Pending new artists → dropdown

`pendingNewArtists(state)` collects every `id: null` chip across album + all tracks, once
per key. Each `ArtistCombobox` gets it as `pending`. `buildOptions(query, results,
pending, selected)` (`artist-options.ts`):

1. blank query → no options;
2. DB results as existing chips, then pending chips whose name contains the query and
   isn't already a DB name;
3. drop anything already chipped on this field;
4. append `Create "<query>"` unless the query exactly matches (normalized) a candidate or a
   selected chip.

So a new artist typed in Track 1 is offered in Track 2 as an option instead of a second
Create. Even if two "new" chips with the same name reach the DB, `publish_release`
creates one row.

## Combobox behavior (`ArtistCombobox.tsx`)

- **Debounce**: 250 ms (`SEARCH_DEBOUNCE_MS`) after the last keystroke → `search(q)`
  (default `searchArtists`; injectable for tests).
- **Stale guard**: `latest` ref holds the current trimmed query; a response for any other
  query is dropped.
- **Results clear on every keystroke**, so results for the previous query can't be picked
  during the debounce.
- **Search failure** (error result or rejection) → empty results, `role="status"` text
  "Couldn't search artists."; the Create row still works.
- Options use `onMouseDown` + `preventDefault` so the pick lands before the input blur
  closes the list.
- ARIA: input `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`; list `role="listbox"`; items `role="option"`.

Keyboard:

| Key | Effect |
|---|---|
| ↓ | open list, highlight next (clamped to last) |
| ↑ | highlight previous (min 0; doesn't open) |
| Enter | only when the list is visible and the option exists: pick highlighted, or the first if none |
| Esc | close, clear highlight |
| Backspace (empty input) | remove the last chip (no-op when `disabled`) |

Chips: `←` / `→` reorder (disabled at the ends), `×` removes, a `new` badge + accent border
for `id: null`.

## Form (`UploadForm.tsx`, `TrackWidget.tsx`, `KindToggle.tsx`)

- `KindToggle`: radio group (Single | Album).
- Album: "Album title" + "Album artists (optional)".
- `TrackWidget`: "MP3 file" (`accept=".mp3,audio/mpeg"`), hint shows name + size, "Track
  title", "Artists"; album mode adds "Track N" header with ↑ / ↓ / ✕. A progress line runs
  along the card's top edge once an upload starts (red on error).
- Footer (sticky): Clear all (confirm) · Cancel (confirm if dirty → `/admin`) · Publish.
- While publishing: Publish shows loading; kind toggle, album title, file/title inputs,
  track controls, Add track, Clear all, Cancel and the artist comboboxes (input + chip
  buttons; `ArtistCombobox` `disabled` prop) are disabled.
- `beforeunload` warning while dirty (`preventDefault()` + `returnValue = ''`; browser reload/close only; not in-app link clicks).

## Validation messages

| Where | Message |
|---|---|
| file (none) | "Choose an MP3." |
| file (wrong ext) | "Only MP3 files are supported." |
| file (0 bytes) | "This file is empty." |
| file (> 50 MB) | "MP3s must be 50 MB or smaller." |
| title | "Title is required." |
| artists | "Add at least one artist." |
| album title | "Album title is required." |
| form banner | "An album needs at least 2 tracks." |

File errors show immediately on selection; the rest appear after the first Publish.

## Styling notes

`TrackCard` does **not** clip overflow (the combobox dropdown must escape the card);
`Progress` rounds/clips itself to the card's top corners. The sticky `Footer` has no
z-index on purpose, so an open dropdown (`zIndex.dropdown`) paints over it.
