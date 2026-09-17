"use server";

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { signStreamUrl } from "./sign";

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

  const url = await signStreamUrl(data.audio_url);
  return { url, error: null };
}
