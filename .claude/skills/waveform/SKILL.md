---
name: waveform
description: Use when touching the player waveform anywhere along its path — the stored loudness file `peaks/<id>.bin`, `peaksKeyFor`, `computePeaks` / `storePeaks`, `usePeaks` / `usePeakReaders`, `useAudioMeterSource` / `isTouchDevice`, `getTrackPeaksUrl`, `getPeaksStatus` / `getPeaksJob`, `AnalyzeWaveforms` (Analyze all), or the tuning constants `LEVEL_GAIN` / `WAVE_GAIN` / `WAVE_MIX`. Also when the waveform is flat on a phone but moves on desktop (or the reverse), the dots or play-button particles don't move while audio plays, someone wants to tune the look, old tracks need backfilling, someone asks "can we change R2 CORS", or someone asks "can we add crossOrigin / AudioContext" to the player.
---

# Waveform (live meter on desktop, stored peaks on touch)

`PixelWaveform` (the dots) and `PlaybackButton` (the particles) react to the music. Their
source is picked once per page load by `isTouchDevice()` (coarse pointer, or iOS/iPadOS):

- **Desktop:** a live Web Audio analyser over the `<audio>` element (`useAudioMeterSource`).
  Desktop never fetches peaks.
- **Touch (iOS, iPadOS, Android):** `peaks/<id>.bin` from R2, read against
  `audio.currentTime`. No Web Audio at all.

**Why:** routing the `<audio>` through an `AudioContext` makes iOS stop playback as soon as
Safari is backgrounded (Android is inconsistent and drains the battery). A plain element
keeps playing when the user switches apps, and the site relies on that.

## Data flow

```
upload    createUploadUrls → { url, peaksUrl } per file
          PUT MP3 → storePeaks(file, peaksUrl): decode @ 8000 Hz (one at a time) → PUT peaks
R2        tracks/<id>.mp3 + peaks/<id>.bin  (key derived by peaksKeyFor, no DB column)
desktop   <audio crossOrigin="anonymous"> → enable() in playQueue/play → AnalyserNode
touch     plain <audio> → 'playing' event → usePeaks → getTrackPeaksUrl → fetch → usePeakReaders
backfill  Analyze all: getPeaksStatus (HEAD) → per track: getPeaksJob → fetch MP3 → storePeaks
```

## Files

| File | Responsibility |
|---|---|
| `src/lib/peaks/format.ts` | `PEAKS_PER_SECOND = 50`, `PEAKS_CONTENT_TYPE`, `peaksKeyFor` |
| `src/lib/peaks/compute.ts` | **Admin only.** `computePeaks`, `storePeaks` (serialized, never throws) |
| `src/lib/admin/actions.ts` | `createUploadUrls` adds a `peaksUrl` to each target |
| `src/components/Upload/upload-engine.ts`, `AdminReleases/upload-one.ts` | `storePeaks` after each MP3 PUT, best effort |
| `src/lib/admin/peaks-actions.ts` | `getPeaksStatus`, `getPeaksJob` (label members only) |
| `src/components/AdminReleases/AnalyzeWaveforms.tsx` | Analyze all; status keyed on id + `AdminTrack.audioKey` |
| `src/lib/storage/actions.ts` | `getTrackPeaksUrl` (via `liveAudioKey`) |
| `src/components/Player/audioMeter.ts` | `isTouchDevice`, contexts + hooks, `useAudioMeterSource` (desktop analyser) |
| `src/components/Player/peaks.ts` | `levelAt`, `shimmer`, `usePeaks`, `usePeakReaders`, tuning constants |
| `src/components/Player/PlayerProvider.tsx` | Picks desktop or touch; the `crossOrigin` effect; `enableMeter`; the 'playing' gate |
| `src/components/Player/{PixelWaveform,PlaybackButton}.tsx` | Consumers |
| `infra/r2/cors.*.json`, `infra/r2/README.md` | Bucket CORS policy for each environment |

## What the hooks return

| | Desktop | Touch |
|---|---|---|
| `useAudioMeter()()` | Smoothed analyser RMS × 4, clamped to 1 | `min(1, levelAt(peaks, currentTime) × LEVEL_GAIN)` |
| `useAudioWaveform()()` | Raw analyser bytes (256, 128 = silence) | `shimmer(levelAt × WAVE_GAIN)`: synthetic sines, new random phases each call |
| Reader gives `0` / `null` | Before `enable()`, when the context isn't `running`, or while paused | While paused |
| Hook is `null` | Only outside `PlayerProvider` | Outside the provider, or until this track's peaks load |

A `null` hook means idle: `PixelWaveform` draws one dim frame and doesn't loop, and
`PlaybackButton` mounts no particles. **Tuning** (Erik): `LEVEL_GAIN = 4`, `WAVE_GAIN = 3`,
`WAVE_MIX` at the top of `peaks.ts`. These constants affect touch only; the desktop × 4 is
in `readLevel`.

## The R2 CORS rule

Each bucket allows `GET`, `HEAD`, `PUT` with `content-type`, from its own site origin only.

- **`GET` is required.** On desktop, playback itself is a CORS request (`crossOrigin`), so
  removing `GET` breaks desktop playback. `GET` also serves the touch peaks `fetch` and the
  admin MP3 `fetch` (Analyze all).
- **`PUT` + `content-type`** is needed for MP3 and peaks uploads.
- **Prod:** PUT/overwrite only, never delete (bucket lock).

Details: [[media-storage]] `References/object-keys.md#cors`.

## Troubleshooting

**Any device:** nothing animates under `prefers-reduced-motion`, while paused, or in a
hidden tab.

**Desktop, audio plays but the dots are flat.** `enable()` bailed or the context isn't
running:
- `audio.crossOrigin` wasn't `'anonymous'` when `enable()` ran (the `PlayerProvider` effect
  sets it).
- `enable()` never ran. Only `playQueue` and `play` call it.
- The `AudioContext` is suspended (`resume()` failed or ran outside a gesture).
- `AudioContext` is unsupported or threw (the error is swallowed).
- A missing CORS `GET` on desktop usually stops playback itself (status `error`), not just
  the dots.

**Touch, audio plays but the dots are flat.**
- There's no `peaks/<id>.bin`, so run **Analyze all** on `/admin/releases/[id]` (the row
  shows "— missing").
- `getTrackPeaksUrl` returns `null`: the key isn't `tracks/<id>.mp3`, the track is archived,
  or there's no session.
- The bucket's CORS `GET` is missing, so the fetch fails silently.
- The peaks haven't loaded yet. They're requested on the `<audio>` 'playing' event, and not
  while `document.hidden`.

## Rules

- **Never** use `crossOrigin`, an `AudioContext`, or `createMediaElementSource` on touch.
  Only `useAudioMeterSource` uses them, and only on desktop.
- `compute.ts` is admin-only; the player never imports it.
- Desktop never fetches peaks.

## Known gaps / decisions

- **Deferred (owner, 2026-10-14):** during publish, add-track and replace, `uploadDone` fires
  only after `storePeaks` (decode + PUT). The bar sits at 100% with no "analyzing…" text, and
  that upload lane waits on the page-wide decode queue. Fix: mark the upload done first and
  await the collected peaks promises before `publishRelease`, or show "analyzing…".
- **Accepted:** Analyze all rows show the title only, with no `HSS###`. The spec had one; the
  owner skipped it as display-only.
- **Accepted:** on touch the readers change identity when peaks load, so `useAudioMeter()`
  consumers (the play buttons) re-render about twice per track change. Phones feel fine.
- **Accepted:** the `storePeaks` chain has no decode timeout.
- **Accepted:** Analyze all re-processes tracks that already have peaks.
- **Accepted:** an orphaned `peaks/<id>.bin` follows the same lifecycle as an orphaned MP3.
  A future cleanup job removes both wherever deletion is allowed ([[content-lifecycle]]).
- iPhone lock-screen playback is a separate gap that predates this work: see
  [[timeline-player]] Known deferrals.

## References

- [internals.md](References/internals.md): the format and decode, reader math, the
  `PlayerProvider` wiring ('playing' gate, started-mark reset), the Analyze all state machine,
  tests.

## Depends on

[[timeline-player]] (the player and `<audio>`), [[visual-effects]] (effect conventions),
[[media-storage]] (signing, key, CORS), [[admin-upload]] (upload engine, edit page),
[[content-lifecycle]] (orphans).
