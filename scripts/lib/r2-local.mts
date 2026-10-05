// The object keys supabase/seed.sql puts in tracks.audio_url. Keep in sync
// with seed.sql. Seed MP3s are copyrighted — never committed.
export const SEED_MEDIA_KEYS = [
  "Castillonaire & sawcy - ASSUMPTIONS.mp3",
  "JERK CLUB TOOL.mp3",
  "DAYE. - LET EM KNOW.mp3",
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
  return SEED_MEDIA_KEYS.filter((k) => !have.has(k));
}
