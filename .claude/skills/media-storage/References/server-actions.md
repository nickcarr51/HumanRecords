# Reference: Storage server actions (`src/lib/storage/actions.ts`)

`"use server"` — each export is a public POST endpoint callable from client components.

## Contract

```ts
export type UrlResult = { url: string | null; error: string | null };
```

Never throws to the client. Error strings are fixed and user-safe:

| Error | When |
|---|---|
| `"Not authenticated."` | `getSessionUser()` returned null. Nothing is signed. |
| `"Track not found."` | Supabase error, no row (bad id, or RLS hid it), **or the track is archived** (`archived_at` set; label members can read archived rows, so the action checks explicitly). |
| `"Could not generate link."` | Signing threw (usually missing `R2_*` env). Real cause is `console.error`-ed server-side. |

## `getTrackStreamUrl(trackId)`

1. `getSessionUser()` → bail if null.
2. Server (cookie) client: `from('tracks').select('audio_url, archived_at').eq('id', trackId).single()` —
   the read goes through RLS as the user. Archived ⇒ "Track not found.", nothing signed.
3. `signStreamUrl(data.audio_url)` inside `try/catch`.
4. `{ url, error: null }`.

Caller: `PlayerProvider`'s load-and-play effect ([[timeline-player]]). It sets
`audio.src = url` on the app's single `<audio preload="metadata" crossOrigin="anonymous">`
element — the bytes go R2 → browser directly, there is no proxy route in between. Because the
element requests in CORS mode (so Web Audio can read the signal for the waveform/particles), the
bucket's CORS policy must allow `GET`/`HEAD` from the site origin or the `error` event fires and
the player shows its error state even with a valid URL
([object-keys.md](object-keys.md#cors)). On `{ error }` from the action it clears `src` and
shows the error state. The provider also pre-signs the *next* track (`presignedRef`) and re-signs
anything older than `PRESIGN_MAX_AGE_MS` (1 h) so a URL can't expire mid-track.

## `getTrackDownloadUrl(trackId)`

1. Session check; `userId = claims.sub`.
2. Select `title, audio_url, archived_at, track_artists ( position, artists ( name ) )`; archived ⇒ "Track not found.", nothing signed or recorded.
3. `namesFrom(track_artists)` then `downloadFilename(names, title, extFromKey(audio_url))` → e.g. `A x B - Title.mp3` (rules in [signing.md](signing.md)).
4. `signDownloadUrl(key, filename)` in `try/catch` — on failure return early, **without**
   recording.
5. Record the download with the **service-role** client (no RLS insert policy on
   `downloads`):
   ```ts
   service.from('downloads').upsert(
     { user_id: userId, track_id: trackId },
     { onConflict: 'user_id,track_id', ignoreDuplicates: true },   // INSERT … ON CONFLICT DO NOTHING
   );
   ```
   One row per user+track; repeat downloads are ignored. The upsert result isn't checked —
   a failed record doesn't block the download.
6. `{ url, error: null }`.

Client side is `DownloadButton` (`src/components/Downloads/`): on click it calls the action, marks the
track downloaded in `DownloadsProvider`, then `navigateTo(url)` (`navigate.ts`, a thin
`window.location.assign`). The signed URL's `Content-Disposition: attachment` makes the browser save the
file without leaving the page (the cross-origin `download` attribute is ignored). Errors show a toast. The URL
expires in 5 minutes, so never pre-fetch it at render time.

## Adding a new signed-URL action

1. Put it in `src/lib/storage/actions.ts` (or a feature's `actions.ts` with `"use server"`).
2. Start with `getSessionUser()` (and a role check if gated — see [[auth]]).
3. Accept an **id**, never a key or URL from the client. Resolve the key with the user's server
   client so RLS applies.
4. Wrap signing in `try/catch`, log the cause, return a fixed error string.
5. Use the service-role client only for writes with no user-scoped policy, and only after the
   session check.
6. Test like `actions.test.ts`: mock `@/lib/auth/session`, `@/lib/supabase/server`,
   `./sign`, and `@/lib/supabase/service` with `vi.fn()`s; assert unauthenticated →
   no signing, success → signed with the stored key, signing failure → error and no side effects.
