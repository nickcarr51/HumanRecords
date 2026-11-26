"use server";

// Release admin write path: pin, reorder, edit, archive/restore, replace,
// add/remove album tracks. Every action re-checks the caller's role (server
// actions can be invoked directly). Everything but pin goes through the
// release services (src/lib/services/releases.ts), which check the role again
// and do each multi-table change in one transaction.

import { revalidatePath } from "next/cache";
import { getCurrentRole } from "@/lib/auth/role";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DomainError } from "@/lib/services/errors";
import * as releaseService from "@/lib/services/releases";
import { getViewer, type Viewer } from "@/lib/services/viewer";
import { headObject } from "@/lib/storage/sign";
import { AUDIO_KEY_RE, MAX_AUDIO_BYTES, MAX_TRACKS, albumValid, artistRefsValid, isUuid } from "./rules";
import type { AddTrackPayload, AdminResult, MoveDirection, ReleaseEditPayload } from "./types";

const FORBIDDEN = "Only label members can do this.";
const INVALID = "Invalid request.";
const FALLBACK = "Couldn't save — try again.";

async function isLabelMember(): Promise<boolean> {
  return (await getCurrentRole()) === "label_member";
}

function refresh(): void {
  revalidatePath("/feed");
  revalidatePath("/admin/releases");
  revalidatePath("/admin/releases/[id]", "page");
  revalidatePath("/albums/[id]", "page");
}

// Refreshes the pages a release write changes and reports success.
function saved(): AdminResult {
  refresh();
  return { error: null };
}

// Runs a release service as the signed-in user and turns its error into the
// message the page shows: the service's own message for a refusal, or the
// logged fallback. `retry` is shown for a deadlock (RETRY) instead.
async function runService(call: (viewer: Viewer) => Promise<unknown>, retry?: string): Promise<AdminResult> {
  try {
    await call(await getViewer(await createClient()));
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === "FORBIDDEN") return { error: FORBIDDEN };
      if (err.code === "INVALID" || err.code === "NOT_FOUND") return { error: err.message };
      if (err.code === "RETRY" && retry) return { error: retry };
    }
    console.error("Release admin call failed", err);
    return { error: FALLBACK };
  }
  return saved();
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
  if (error) {
    console.error("Release admin call failed", error);
    return { error: FALLBACK };
  }
  if (!data?.length) return { error: "Release not found." };
  return saved();
}

export async function moveRelease(releaseId: string, direction: MoveDirection): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId) || (direction !== "up" && direction !== "down")) return { error: INVALID };

  // Two admins moving neighbours at once can deadlock; Postgres aborts one.
  return runService(
    (viewer) => releaseService.moveRelease(viewer, releaseId, direction),
    "Couldn't reorder — try again",
  );
}

export async function archiveRelease(releaseId: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId)) return { error: INVALID };
  return runService((viewer) => releaseService.archiveRelease(viewer, releaseId));
}

export async function restoreRelease(releaseId: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId)) return { error: INVALID };
  return runService((viewer) => releaseService.restoreRelease(viewer, releaseId));
}

export async function removeTrack(trackId: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(trackId)) return { error: INVALID };
  return runService((viewer) => releaseService.archiveTrack(viewer, trackId));
}

export async function restoreTrack(trackId: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(trackId)) return { error: INVALID };
  return runService((viewer) => releaseService.restoreTrack(viewer, trackId));
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
  if (payload.tracks.some((t) => !isUuid(t?.id) || typeof t.title !== "string" || !artistRefsValid(t.artists))) {
    return { error: INVALID };
  }
  if (payload.album !== undefined && !albumValid(payload.album)) return { error: INVALID };

  return runService((viewer) => releaseService.updateRelease(viewer, releaseId, payload));
}

export async function addAlbumTrack(releaseId: string, payload: AddTrackPayload): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(releaseId) || !payload || typeof payload !== "object") return { error: INVALID };
  if (typeof payload.audioKey !== "string" || !AUDIO_KEY_RE.test(payload.audioKey)) {
    return { error: "Invalid audio file reference." };
  }
  if (typeof payload.title !== "string" || !artistRefsValid(payload.artists)) return { error: INVALID };
  const problem = await verifyUpload(payload.audioKey);
  if (problem) return { error: problem };

  return runService((viewer) => releaseService.addAlbumTrack(viewer, releaseId, payload));
}

export async function replaceTrackAudio(trackId: string, audioKey: string): Promise<AdminResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (!isUuid(trackId)) return { error: INVALID };
  if (typeof audioKey !== "string" || !AUDIO_KEY_RE.test(audioKey)) {
    return { error: "Invalid audio file reference." };
  }
  const problem = await verifyUpload(audioKey);
  if (problem) return { error: problem };

  return runService((viewer) => releaseService.replaceTrackAudio(viewer, trackId, audioKey));
}
