"use server";

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { signDownloadUrl, signStreamUrl } from "./sign";

export type UrlResult = { url: string | null; error: string | null };

export async function getTrackStreamUrl(trackId: string): Promise<UrlResult> {
  const claims = await getSessionUser();
  if (!claims) return { url: null, error: "Not authenticated." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select("audio_url")
    .eq("id", trackId)
    .single();
  if (error || !data) return { url: null, error: "Track not found." };

  // Signing can throw on server misconfig (missing R2 env). Keep the
  // { url, error } contract instead of rejecting the action so the UI can
  // surface a clean message; the real cause is logged server-side.
  try {
    const url = await signStreamUrl(data.audio_url);
    return { url, error: null };
  } catch (err) {
    console.error("Failed to sign stream URL", err);
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
    .select("title, audio_url")
    .eq("id", trackId)
    .single();
  if (error || !data) return { url: null, error: "Track not found." };

  const ext = data.audio_url.split(".").pop() ?? "bin";
  const filename = `${data.title}.${ext}`;

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
