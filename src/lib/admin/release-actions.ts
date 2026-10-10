"use server";

// Release admin write path: pin, reorder, edit, archive/restore, replace,
// add/remove album tracks. Every action re-checks the caller's role (server
// actions can be invoked directly); the SQL functions check it again and do
// each multi-table change in one transaction.

import { revalidatePath } from "next/cache";
import { getCurrentRole } from "@/lib/auth/role";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { headObject } from "@/lib/storage/sign";
import type { Json } from "@/lib/supabase/database.types";
import { AUDIO_KEY_RE, MAX_AUDIO_BYTES, MAX_TRACKS, UUID_RE } from "./rules";
import type { AddTrackPayload, AdminResult, ArtistRef, MoveDirection, ReleaseEditPayload } from "./types";

const FORBIDDEN = "Only label members can do this.";
const INVALID = "Invalid request.";
const FALLBACK = "Couldn't save — try again.";

type DbError = { code?: string; message: string };

async function isLabelMember(): Promise<boolean> {
  return (await getCurrentRole()) === "label_member";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function refresh(): void {
  revalidatePath("/feed");
  revalidatePath("/admin/releases");
  revalidatePath("/admin/releases/[id]", "page");
  revalidatePath("/albums/[id]", "page");
}

// 22023/P0002 messages are written for the UI in the SQL functions.
function finish(error: DbError | null): AdminResult {
  if (!error) {
    refresh();
    return { error: null };
  }
  if (error.code === "42501") return { error: FORBIDDEN };
  if (error.code === "22023" || error.code === "P0002") return { error: error.message };
  console.error("Release admin call failed", error);
  return { error: FALLBACK };
}

// releases has no user update policy, so pin/unpin goes through the service
// client after the role check. Archived releases are left alone.
export async function setPinned(releaseId: string, pinned: boolean): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId) || typeof pinned !== "boolean") return { error: INVALID };

  const { data, error } = await createServiceClient()
    .from("releases")
    .update({ pinned })
    .eq("id", releaseId)
    .is("archived_at", null)
    .select("id");
  if (error) return finish(error);
  if (!data?.length) return { error: "Release not found." };
  return finish(null);
}

export async function moveRelease(releaseId: string, direction: MoveDirection): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId) || (direction !== "up" && direction !== "down")) return { error: INVALID };

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_release", { target: releaseId, direction });
  // Two admins moving neighbours at once can deadlock; Postgres aborts one.
  if (error?.code === "40P01") return { error: "Couldn't reorder — try again" };
  return finish(error);
}

export async function archiveRelease(releaseId: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId)) return { error: INVALID };
  const { error } = await (await createClient()).rpc("archive_release", { p_release_id: releaseId });
  return finish(error);
}

export async function restoreRelease(releaseId: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId)) return { error: INVALID };
  const { error } = await (await createClient()).rpc("restore_release", { p_release_id: releaseId });
  return finish(error);
}

export async function removeTrack(trackId: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(trackId)) return { error: INVALID };
  const { error } = await (await createClient()).rpc("archive_track", { p_track_id: trackId });
  return finish(error);
}

export async function restoreTrack(trackId: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(trackId)) return { error: INVALID };
  const { error } = await (await createClient()).rpc("restore_track", { p_track_id: trackId });
  return finish(error);
}

// resolve_artist_refs would raise a raw 22P02 on a malformed { id }, so check here.
function artistRefsValid(refs: unknown): refs is ArtistRef[] {
  return (
    Array.isArray(refs) &&
    refs.every((r) => {
      if (!r || typeof r !== "object") return false;
      return "id" in r ? isUuid((r as { id: unknown }).id) : true;
    })
  );
}

// The browser PUT the file straight to R2; make sure it actually landed.
async function verifyUpload(key: string): Promise<string | null> {
  try {
    const head = await headObject(key);
    if (!head || head.size <= 0) return "The file didn't finish uploading. Try again.";
    if (head.size > MAX_AUDIO_BYTES) return "MP3s must be 50 MB or smaller.";
    return null;
  } catch (err) {
    console.error("Failed to verify upload", err);
    return "Couldn't verify the uploaded file. Try again.";
  }
}

export async function saveRelease(releaseId: string, payload: ReleaseEditPayload): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId) || !payload || typeof payload !== "object" || !Array.isArray(payload.tracks)) {
    return { error: INVALID };
  }
  if (payload.tracks.length > MAX_TRACKS) return { error: "Too many tracks." };
  if (payload.tracks.some((t) => !isUuid(t?.id) || !artistRefsValid(t.artists))) return { error: INVALID };
  if (payload.album !== undefined && !artistRefsValid(payload.album?.artists)) return { error: INVALID };

  const { error } = await (await createClient()).rpc("update_release", {
    p_release_id: releaseId,
    payload: payload as unknown as Json,
  });
  return finish(error);
}

export async function addAlbumTrack(releaseId: string, payload: AddTrackPayload): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId) || !payload || typeof payload !== "object") return { error: INVALID };
  if (typeof payload.audioKey !== "string" || !AUDIO_KEY_RE.test(payload.audioKey)) {
    return { error: "Invalid audio file reference." };
  }
  if (!artistRefsValid(payload.artists)) return { error: INVALID };
  const problem = await verifyUpload(payload.audioKey);
  if (problem) return { error: problem };

  const { error } = await (await createClient()).rpc("add_album_track", {
    p_release_id: releaseId,
    payload: payload as unknown as Json,
  });
  return finish(error);
}

export async function replaceTrackAudio(trackId: string, audioKey: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(trackId)) return { error: INVALID };
  if (typeof audioKey !== "string" || !AUDIO_KEY_RE.test(audioKey)) {
    return { error: "Invalid audio file reference." };
  }
  const problem = await verifyUpload(audioKey);
  if (problem) return { error: problem };

  const { error } = await (await createClient()).rpc("replace_track_audio", {
    p_track_id: trackId,
    p_audio_key: audioKey,
  });
  return finish(error);
}
