// Seed MP3s: the file you drop in supabase/seed-media/ (sample-track-a/b/c.mp3) → the
// object key supabase/seed.sql puts in tracks.audio_url. Keys use the same
// `tracks/<uuid>.mp3` shape as admin uploads (AUDIO_KEY_RE), with fixed ids so
// the seed always points at the same objects. Keep in sync with seed.sql.
// Seed MP3s are copyrighted — never committed.
export const SEED_MEDIA = [
  { file: "sample-track-a.mp3", key: "tracks/5e3c1a2b-7d4e-4f60-9a1b-2c3d4e5f6a71.mp3" },
  { file: "sample-track-b.mp3", key: "tracks/8f2a6b1c-3e4d-4a5b-8c6d-7e8f9a0b1c22.mp3" },
  { file: "sample-track-c.mp3", key: "tracks/c41d7e9f-2a3b-4c5d-b6e7-f8091a2b3c43.mp3" },
] as const;

// Refuse anything but the local bucket so a stale .env.local can't write to dev/prod.
export function assertLocalBucket(name: string | undefined): string {
  if (!name || !name.endsWith("-local")) {
    throw new Error(`R2_BUCKET_NAME must be the local bucket (…-local); got "${name ?? ""}"`);
  }
  return name;
}

export function missingSeedFiles(present: string[]): string[] {
  const have = new Set(present);
  return SEED_MEDIA.map((m) => m.file).filter((f) => !have.has(f));
}
