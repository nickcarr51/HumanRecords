# R2 CORS rules

The CORS policy for each bucket, kept here as the record. Paste a file's contents
into Cloudflare → R2 → <bucket> → Settings → CORS Policy, then update the table.

Each bucket allows its own environment's site to:

- `PUT` (with the `content-type` header) — browser uploads: MP3s and their
  `peaks/<id>.bin` waveform files (presigned PUTs from the admin pages).
- `GET`/`HEAD` — on **desktop** the `<audio>` element loads signed track URLs with
  `crossOrigin="anonymous"` so Web Audio can read the signal for the waveform and
  button particles; without `GET`, desktop playback fails entirely (the browser
  refuses CORS-mode media the bucket hasn't allowed). On **phones/tablets** the
  element is plain (not CORS), but the player `fetch`es `peaks/<id>.bin` and the
  admin "Analyze all" `fetch`es MP3s, which also need `GET`. See the `waveform` skill.

Downloads (navigation) and artwork (`<img>`) don't need CORS.

**Testing on a phone over LAN** (`http://192.168.x.x:3000`): that is a different origin
from `localhost`, so the phone plays audio but shows idle dots (its peaks `fetch` is
refused) until you add it to the local bucket's policy by hand
in the dashboard. Don't commit LAN addresses to `cors.local.json`; they change per network. `*_art_url` columns
hold R2 object keys, signed via `signImageUrl` (see the `media-storage` skill).

| File | Bucket | Status |
|---|---|---|
| `cors.local.json` | local media bucket | applied 2026-10-11 (GET/HEAD/PUT) |
| `cors.dev.json` | dev media bucket | applied 2026-10-11 (GET/HEAD/PUT, develop site only) |
| `cors.prod.json` | production media bucket | applied 2026-10-11 (GET/HEAD/PUT, services.humanrecords.co + vercel.app) |
