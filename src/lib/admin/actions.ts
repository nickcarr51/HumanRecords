"use server";

// The admin write path. Every action re-checks the caller's role: the
// /admin layout does not protect server actions, which can be invoked
// directly. publish_release checks the role again inside the database.

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/auth/role";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/supabase/artists";
import type { Json } from "@/lib/supabase/database.types";
import { headObject, signUploadUrl } from "@/lib/storage/sign";
import {
  ARTIST_SEARCH_LIMIT,
  AUDIO_CONTENT_TYPE,
  AUDIO_KEY_RE,
  MAX_AUDIO_BYTES,
  MAX_TRACKS,
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
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return { artists: [], error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artists")
    .select("id, name")
    .ilike("name", `%${escapeLike(q)}%`)
    .order("name", { ascending: true })
    .limit(ARTIST_SEARCH_LIMIT);
  if (error) return { artists: [], error: "Search failed." };
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
        return { clientId: f.clientId, key, url: await signUploadUrl(key, AUDIO_CONTENT_TYPE) };
      }),
    );
    return { targets, error: null };
  } catch (err) {
    console.error("Failed to sign upload URLs", err);
    return { targets: null, error: "Couldn't prepare the upload." };
  }
}

export async function publishRelease(payload: ReleasePayload): Promise<PublishResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };

  const keys = payload.tracks.map((t) => t.audioKey);
  if (keys.some((k) => !AUDIO_KEY_RE.test(k))) return { error: "Invalid audio file reference." };

  try {
    for (const key of keys) {
      const head = await headObject(key);
      if (!head) return { error: "A file didn't finish uploading. Publish again to retry." };
      if (head.size > MAX_AUDIO_BYTES) return { error: "MP3s must be 50 MB or smaller." };
    }
  } catch (err) {
    console.error("Failed to verify uploads", err);
    return { error: "Couldn't verify the uploaded files. Try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_release", {
    payload: payload as unknown as Json,
  });
  if (error) {
    if (error.code === "42501") return { error: FORBIDDEN };
    if (error.code === "22023") return { error: error.message };
    console.error("publish_release failed", error);
    return { error: "Couldn't publish. Nothing was saved — try again." };
  }

  // redirect() throws to navigate; keep it outside any try/catch.
  revalidatePath("/feed");
  redirect("/feed");
}
