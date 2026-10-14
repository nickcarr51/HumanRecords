"use server";

// Re-analyze waveforms from the release edit page. The browser does the
// decoding (Web Audio); these actions only check what exists and sign URLs.
// Every action re-checks the role: server actions can be invoked directly.

import { getCurrentRole } from "@/lib/auth/role";
import { PEAKS_CONTENT_TYPE, peaksKeyFor } from "@/lib/peaks/format";
import { headObject, signStreamUrl, signUploadUrl } from "@/lib/storage/sign";
import { createClient } from "@/lib/supabase/server";
import { MAX_TRACKS, UUID_RE } from "./rules";

const FORBIDDEN = "Only label members can do this.";
const INVALID = "Invalid request.";

export type PeaksStatusResult = { status: Record<string, boolean>; error: null } | { status: null; error: string };
export type PeaksJobResult =
  | { audioUrl: string; peaksUrl: string; error: null }
  | { audioUrl: null; peaksUrl: null; error: string };

async function isLabelMember(): Promise<boolean> {
  return (await getCurrentRole()) === "label_member";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** trackId → whether peaks/<id>.bin exists in R2. */
export async function getPeaksStatus(trackIds: string[]): Promise<PeaksStatusResult> {
  if (!(await isLabelMember())) return { status: null, error: FORBIDDEN };
  if (!Array.isArray(trackIds) || trackIds.length > MAX_TRACKS || !trackIds.every(isUuid)) {
    return { status: null, error: INVALID };
  }
  const { data, error } = await (await createClient()).from("tracks").select("id, audio_url").in("id", trackIds);
  if (error || !data) {
    console.error("Failed to read tracks for peaks status", error);
    return { status: null, error: "Couldn't check waveforms." };
  }
  try {
    const entries = await Promise.all(
      data.map(async (t) => {
        const key = peaksKeyFor(t.audio_url);
        return [t.id, key !== null && (await headObject(key)) !== null] as const;
      }),
    );
    return { status: Object.fromEntries(entries), error: null };
  } catch (err) {
    console.error("Failed to check peaks in R2", err);
    return { status: null, error: "Couldn't check waveforms." };
  }
}

/** Signed URLs to analyze one track: GET its MP3, PUT its peaks. Minted per track
 *  so the 15-minute PUT can't expire during a long run. */
export async function getPeaksJob(trackId: string): Promise<PeaksJobResult> {
  const fail = (error: string): PeaksJobResult => ({ audioUrl: null, peaksUrl: null, error });
  if (!(await isLabelMember())) return fail(FORBIDDEN);
  if (!isUuid(trackId)) return fail(INVALID);
  const { data, error } = await (await createClient()).from("tracks").select("audio_url").eq("id", trackId).single();
  if (error || !data) return fail("Track not found.");
  const peaksKey = peaksKeyFor(data.audio_url);
  if (!peaksKey) return fail("This track's audio can't be analyzed.");
  try {
    return {
      audioUrl: await signStreamUrl(data.audio_url),
      peaksUrl: await signUploadUrl(peaksKey, PEAKS_CONTENT_TYPE),
      error: null,
    };
  } catch (err) {
    console.error("Failed to sign peaks job URLs", err);
    return fail("Couldn't prepare the analysis.");
  }
}
