"use server";

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { namesFrom, type ArtistNameRel } from "@/lib/supabase/artist-names";
import { createServiceClient } from "@/lib/supabase/service";
import { peaksKeyFor } from "@/lib/peaks/format";
import { downloadFilename, extFromKey } from "./filename";
import { signDownloadUrl, signStreamUrl } from "./sign";

export type UrlResult = { url: string | null; error: string | null };

// The live (non-archived) track's audio key, or an error result.
async function liveAudioKey(trackId: string): Promise<{ key: string } | UrlResult> {
  const claims = await getSessionUser();
  if (!claims) return { url: null, error: "Not authenticated." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select("audio_url, archived_at")
    .eq("id", trackId)
    .single();
  if (error || !data || data.archived_at) return { url: null, error: "Track not found." };
  return { key: data.audio_url };
}

export async function getTrackStreamUrl(trackId: string): Promise<UrlResult> {
  const found = await liveAudioKey(trackId);
  if (!("key" in found)) return found;

  // Signing can throw on server misconfig (missing R2 env). Keep the
  // { url, error } contract instead of rejecting the action so the UI can
  // surface a clean message; the real cause is logged server-side.
  try {
    const url = await signStreamUrl(found.key);
    return { url, error: null };
  } catch (err) {
    console.error("Failed to sign stream URL", err);
    return { url: null, error: "Could not generate link." };
  }
}

// The track's stored loudness file (peaks/<id>.bin). The URL may 404 for a
// track that was never analyzed; the player then shows idle dots.
export async function getTrackPeaksUrl(trackId: string): Promise<UrlResult> {
  const found = await liveAudioKey(trackId);
  if (!("key" in found)) return found;
  const peaksKey = peaksKeyFor(found.key);
  if (!peaksKey) return { url: null, error: null };
  try {
    return { url: await signStreamUrl(peaksKey), error: null };
  } catch (err) {
    console.error("Failed to sign peaks URL", err);
    return { url: null, error: "Could not generate link." };
  }
}

export async function getTrackDownloadUrl(trackId: string): Promise<UrlResult> {
  const claims = await getSessionUser();
  if (!claims) return { url: null, error: "Not authenticated." };
  const userId = claims.sub as string;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select("title, audio_url, archived_at, track_artists ( position, artists ( name ) )")
    .eq("id", trackId)
    .single();
  if (error || !data || data.archived_at) return { url: null, error: "Track not found." };

  // Saved as "A x B - Title.mp3" (credited order). Only the name changes;
  // the R2 bytes (quality + ID3 tags) are served untouched.
  const artistNames = namesFrom(data.track_artists as unknown as ArtistNameRel);
  const filename = downloadFilename(artistNames, data.title, extFromKey(data.audio_url));

  // Signing can throw on server misconfig (missing R2 env). Keep the
  // { url, error } contract; log the real cause server-side. Recording
  // happens only after a URL is successfully minted.
  let url: string;
  try {
    url = await signDownloadUrl(data.audio_url, filename);
  } catch (err) {
    console.error("Failed to sign download URL", err);
    return { url: null, error: "Could not generate link." };
  }

  // Record the download. downloads has no RLS insert policy, so use the
  // service-role client. ignoreDuplicates => INSERT ... ON CONFLICT DO
  // NOTHING: one download per (user, track), repeats ignored.
  const service = createServiceClient();
  await service
    .from("downloads")
    .upsert(
      { user_id: userId, track_id: trackId },
      { onConflict: "user_id,track_id", ignoreDuplicates: true },
    );

  return { url, error: null };
}
