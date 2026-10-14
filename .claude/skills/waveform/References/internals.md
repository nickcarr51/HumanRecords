# Reference: Waveform internals

## Format (`src/lib/peaks/format.ts`)

One byte per 20 ms slice (`PEAKS_PER_SECOND = 50`): the RMS of the mono mix, `0–255`. It
uses RMS rather than peak amplitude, because mastered music peaks near full scale in almost
every slice, which would pin the visuals at maximum. The Content-Type is
`application/octet-stream` (`PEAKS_CONTENT_TYPE`). The presigned PUT signs it, so the browser
must send exactly that or R2 answers `SignatureDoesNotMatch`. `peaksKeyFor(audioKey)` maps
`tracks/<id>.mp3` → `peaks/<id>.bin` and returns `null` for any other key shape (seed keys,
for example).

## Compute + store (`src/lib/peaks/compute.ts`, admin browser only)

- `computePeaks(blob)` decodes with an `OfflineAudioContext(1, 1, 8000)`. A 50 MB MP3 is
  about 1.2 GB of float PCM at 44100 Hz, and 8000 Hz divides evenly into 160 samples per
  slice. If the browser refuses that rate, it falls back to 44100. `decodeAudioData`
  resamples to the context rate. `peaksFromChannels` averages the channels to mono and takes
  the RMS per slice.
- `storePeaks(blob, peaksUrl, compute?)` chains every decode on a module-level
  `decodeChain`, so only one decode runs at a time in the page, and a failure never breaks
  the chain. It then PUTs the bytes and returns `res.ok`. **It never throws**, and a failure
  returns `false`. Callers add `.catch(() => false)` anyway.
- Callers: `runPublish` (`upload-engine.ts`, inside `runPool` with concurrency 2, after
  `putFile` and **before** `uploadDone`), `uploadOne` (`upload-one.ts`, used by `ReplaceAudio`
  and `AddTrackForm`, after `putFile` and before it returns the key), and `AnalyzeWaveforms`.
  A peaks failure never fails publish, add-track or replace.

## Server actions

- `getTrackPeaksUrl(trackId)` (`src/lib/storage/actions.ts`): `liveAudioKey` handles the
  session, the archived check and the `audio_url`. Then `peaksKeyFor` → `signStreamUrl`. A
  non-`tracks/` key gives `{ url: null, error: null }`. Signing doesn't check that the
  object exists, so a never-analyzed track gets a URL that returns 404.
- `getPeaksStatus(trackIds)` (`src/lib/admin/peaks-actions.ts`) checks for a label member,
  ≤ `MAX_TRACKS` UUIDs. It reads `audio_url`, then runs `headObject(peaksKeyFor(...))` per
  track and returns `{ status: Record<id, boolean> }`.
- `getPeaksJob(trackId)` checks for a label member and a UUID, then returns
  `{ audioUrl: signStreamUrl(mp3), peaksUrl: signUploadUrl(peaksKey) }`. Each track gets its
  own URLs, so the 15-minute PUT can't expire during a long run.

## Player wiring (`PlayerProvider.tsx`)

- `const live = useAudioMeterSource(audioRef)`. `live.supported` is `!isTouchDevice()`,
  decided once at mount. On the server it is `true`, but it only feeds context values and an
  effect, never markup, so there's no hydration mismatch.
- **`crossOrigin` effect:** `if (live.supported) audio.crossOrigin = 'anonymous'; else
  audio.removeAttribute('crossorigin')`.
- **`enableMeter` (`live.enable`)** is called at the top of `playQueue` and `play` (user
  gestures). It bails unless the device is supported, the element exists,
  `audio.crossOrigin === 'anonymous'`, and `AudioContext` is defined. On the first call it
  builds `createMediaElementSource → AnalyserNode (fftSize 256) → destination`, then always
  calls `context.resume()`. On unmount it disconnects the graph and closes the context.
- **Touch 'playing' gate:** `onPlaying` sets `audioStartedId` to the current queue track's
  id. `peakTrackId` is that id only when `!live.supported && audioStartedId ===
  currentTrack?.id`, otherwise `undefined`. The reason: Next runs client server actions one
  at a time, so an earlier request would queue ahead of `getTrackStreamUrl`, and a quick skip
  would leave a request running for a track that's already gone. The dots read `currentTime`
  every frame, so a late load is never out of sync.
- **Started mark reset:** the load effect runs `setAudioStartedId((id) => (id ===
  currentTrack.id ? id : null))` on every track change. A different track, including going
  back to the last one that played, waits for its own 'playing' event.
- `readLevel = live.supported ? live.readLevel : peakReaders.readLevel` (same for
  `readWaveform`), provided through `AudioMeterContext` / `AudioWaveformContext`.

## Readers (`peaks.ts`, touch)

- `usePeaks(trackId, load = loadPeaks)`: `loadPeaks` = `getTrackPeaksUrl` → `fetch` with an
  `AbortSignal` → `Uint8Array`, or `null` on any failure. The effect starts at once unless
  `document.hidden`. It retries on `visibilitychange` (a locked phone that advances tracks
  fetches when the user comes back), aborts on track change or unmount, and keys its state by
  track id, so a new track never shows the old track's peaks.
- `usePeakReaders(audioRef, peaks)` is `useMemo` on `[audioRef, peaks]`. It returns
  `{ readLevel: null, readWaveform: null }` without peaks.
- `levelAt(peaks, t)` takes the max of slices `i-1, i, i+1` at `i = floor(t × 50)`, divided
  by 255. Out of range gives `0`.
- `shimmer(level)` returns 256 bytes centred on 128 with a swing of `min(1, level) × 127`,
  summing `WAVE_MIX` (3 / 9 / 23 cycles, weights 0.45 / 0.35 / 0.2, which sum to 1). Phases
  are random on each call, so the dots move but don't show a real waveform. An injected
  `random` makes it deterministic in tests.

## Desktop analyser (`audioMeter.ts`)

`readLevel` runs `getByteTimeDomainData`, then `rms = min(1, sqrt(mean(((b-128)/128)²)) × 4)`,
then `level += (rms - level) × 0.25`. It's computed at most once per 8 ms, and other readers
in the same frame reuse it. `readWaveform` returns the analyser's byte buffer itself. Both
return `0` / `null` when there's no meter, the context isn't `running`, or the element is
paused.

## Analyze all (`AnalyzeWaveforms.tsx`)

- Props: `tracks: { id, title, audioKey }[]`. The edit page passes the non-archived
  `AdminTrack`s; `AdminTrack.audioKey` is `tracks.audio_url`.
- Row states: `checking`, then `has` ("✓ has waveform") / `missing` ("— missing") /
  `unknown`; during a run, `analyzing`, then `done` ("✓ analyzed") / `failed`.
- The status effect is keyed on `JSON.stringify([[id, audioKey], ...])`. When a known id's
  `audioKey` changes (Replace MP3 refreshes the page with the same id and a new key, so the
  peaks file is new), that row goes back to `checking` (unless it is `analyzing`) and is
  re-checked. Rows added after mount count as `checking`.
- `settle` only updates rows that are still `checking`, so a late status response can't undo
  a run. A `live` flag drops the response after the effect re-runs or unmounts.
- `analyzeAll` runs one track at a time (each decode holds a whole track in memory), stops
  when unmounted, and overwrites any file already there.

## Tests

`src/lib/peaks/{format,compute}.test.ts`, `src/lib/admin/peaks-actions.test.ts`,
`src/components/AdminReleases/{AnalyzeWaveforms.test.tsx,upload-one.test.ts}`,
`src/components/Player/peaks.test.tsx` (inject `load` into `usePeaks`),
`PlayerProvider.test.tsx` ("desktop: …" checks that `crossOrigin === "anonymous"` and that
no peaks are fetched; "touch:" tests use `asTouch()` to stub `(pointer: coarse)`),
`PixelWaveform.test.tsx`. jsdom has no `AudioContext`, so on desktop `enable()` is a no-op
in tests. Check the look on a real phone and a real desktop browser.
