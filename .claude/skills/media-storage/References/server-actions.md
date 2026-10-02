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
| `"Track not found."` | Supabase error or no row (bad id, or RLS hid it). |
| `"Could not generate link."` | Signing threw (usually missing `R2_*` env). Real cause is `console.error`-ed server-side. |

## `getTrackStreamUrl(trackId)`

1. `getSessionUser()` → bail if null.
2. Server (cookie) client: `from('tracks').select('audio_url').eq('id', trackId).single()` —
   the read goes through RLS as the user.
3. `signStreamUrl(data.audio_url)` inside `try/catch`.
4. `{ url, error: null }`.

Caller: `PlayerProvider`'s load-and-play effect ([[timeline-player]]). It sets
`audio.src = url`; on `{ error }` it clears `src` and shows the error state.

## `getTrackDownloadUrl(trackId)`

1. Session check; `userId = claims.sub`.
2. Select `title, audio_url`.
3. Filename = `${title}.${extension of audio_url}` (fallback `bin`).
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

Not wired to UI yet. When adding a download button: call the action on click, then
`window.location.href = url` (or an `<a download>` with the URL) — the URL expires in 5 minutes,
so don't pre-fetch it at render time.

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
