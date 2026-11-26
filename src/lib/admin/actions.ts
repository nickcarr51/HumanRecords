"use server";

// The admin write path. Every action re-checks the caller's role: the
// /admin layout does not protect server actions, which can be invoked
// directly. The publishRelease service (src/lib/services/releases.ts) checks
// the role again and saves the whole release in one transaction.

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/auth/role";
import { PEAKS_CONTENT_TYPE, peaksKeyFor } from "@/lib/peaks/format";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/supabase/artists";
import { DomainError } from "@/lib/services/errors";
import * as releaseService from "@/lib/services/releases";
import { getViewer } from "@/lib/services/viewer";
import { headObject, signUploadUrl } from "@/lib/storage/sign";
import {
  ARTIST_SEARCH_LIMIT,
  AUDIO_CONTENT_TYPE,
  AUDIO_KEY_RE,
  MAX_AUDIO_BYTES,
  MAX_TRACKS,
  albumValid,
  artistRefsValid,
  audioFileError,
} from "./rules";
import type {
  ArtistSearchResult,
  PublishResult,
  ReleasePayload,
  UploadRequest,
  UploadUrlsResult,
} from "./types";

const FORBIDDEN = "Only label members can do this.";
const MAX_QUERY_LENGTH = 100;

async function isLabelMember(): Promise<boolean> {
  return (await getCurrentRole()) === "label_member";
}

export async function searchArtists(query: string): Promise<ArtistSearchResult> {
  if (!(await isLabelMember())) return { artists: [], error: FORBIDDEN };
  if (typeof query !== "string") return { artists: [], error: null };
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return { artists: [], error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artists")
    .select("id, name")
    .ilike("name", `%${escapeLike(q)}%`)
    .order("name", { ascending: true })
    .limit(ARTIST_SEARCH_LIMIT);
  if (error) {
    console.error("Artist search failed", error);
    return { artists: [], error: "Search failed." };
  }
  return { artists: data ?? [], error: null };
}

export async function createUploadUrls(files: UploadRequest[]): Promise<UploadUrlsResult> {
  if (!(await isLabelMember())) return { targets: null, error: FORBIDDEN };
  if (files.length === 0) return { targets: null, error: "No files to upload." };
  if (files.length > MAX_TRACKS) return { targets: null, error: "Too many files." };
  for (const f of files) {
    const problem = audioFileError(f);
    if (problem) return { targets: null, error: `${f.name}: ${problem}` };
  }

  try {
    const targets = await Promise.all(
      files.map(async (f) => {
        const key = `tracks/${randomUUID()}.mp3`;
        // Minted just above, so it always has a peaks key.
        const peaksKey = peaksKeyFor(key) as string;
        return {
          clientId: f.clientId,
          key,
          url: await signUploadUrl(key, AUDIO_CONTENT_TYPE),
          peaksUrl: await signUploadUrl(peaksKey, PEAKS_CONTENT_TYPE),
        };
      }),
    );
    return { targets, error: null };
  } catch (err) {
    console.error("Failed to sign upload URLs", err);
    return { targets: null, error: "Couldn't prepare the upload." };
  }
}

// The shape the upload form sends and the publishRelease service takes: a
// known kind, album details (if any) and tracks with string titles and valid
// artist refs. Audio keys are checked separately below.
function releaseShapeValid(payload: ReleasePayload): boolean {
  return (
    (payload.kind === "single" || payload.kind === "album") &&
    (payload.album === undefined || albumValid(payload.album)) &&
    payload.tracks.every((t) => !!t && typeof t === "object" && typeof t.title === "string" && artistRefsValid(t.artists))
  );
}

export async function publishRelease(payload: ReleasePayload): Promise<PublishResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.tracks)) {
    return { error: "Invalid release." };
  }
  if (payload.tracks.length > MAX_TRACKS) return { error: "Too many tracks." };
  if (!releaseShapeValid(payload)) return { error: "Invalid release." };

  const keys: unknown[] = payload.tracks.map((t) => t?.audioKey);
  if (
    keys.some((k) => typeof k !== "string" || !AUDIO_KEY_RE.test(k)) ||
    new Set(keys).size !== keys.length
  ) {
    return { error: "Invalid audio file reference." };
  }

  try {
    for (const key of keys as string[]) {
      const head = await headObject(key);
      if (!head || head.size <= 0) return { error: "A file didn't finish uploading. Publish again to retry." };
      if (head.size > MAX_AUDIO_BYTES) return { error: "MP3s must be 50 MB or smaller." };
    }
  } catch (err) {
    console.error("Failed to verify uploads", err);
    return { error: "Couldn't verify the uploaded files. Try again." };
  }

  try {
    await releaseService.publishRelease(await getViewer(await createClient()), payload);
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === "FORBIDDEN") return { error: FORBIDDEN };
      if (err.code === "INVALID") return { error: err.message };
    }
    console.error("Publish failed", err);
    return { error: "Couldn't publish. Nothing was saved — try again." };
  }

  // redirect() throws to navigate; keep it outside any try/catch.
  revalidatePath("/feed");
  redirect("/feed");
}
