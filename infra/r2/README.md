# R2 CORS rules

The CORS policy for each bucket, kept here as the record. Paste a file's contents
into Cloudflare → R2 → <bucket> → Settings → CORS Policy, then update the table.

Each bucket allows its own environment's site to:

- `PUT` — browser uploads (presigned PUT from `/admin/upload`).
- `GET`/`HEAD` — the `<audio>` element loads signed track URLs with
  `crossOrigin="anonymous"` so Web Audio can read the signal for the player
  waveform and button particles. Without `GET`, playback fails entirely
  (the browser refuses CORS-mode media the bucket hasn't allowed).

Downloads (navigation) and artwork (`<img>`) don't need CORS. `*_art_url` columns
hold R2 object keys, signed via `signImageUrl` (see the `media-storage` skill).

| File | Bucket | Status |
|---|---|---|
| `cors.local.json` | local media bucket | applied 2026-10-11 (GET/HEAD/PUT) |
| `cors.dev.json` | dev media bucket | applied 2026-10-11 (GET/HEAD/PUT, develop site only) |
| `cors.prod.json` | production media bucket | applied 2026-10-11 (GET/HEAD/PUT, services.humanrecords.co + vercel.app) |
