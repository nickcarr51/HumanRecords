"use server";

// Release admin write path: pin, reorder, edit, archive/restore, replace,
// add/remove album tracks. Every action re-checks the caller's role (server
// actions can be invoked directly); the SQL functions check it again and do
// each multi-table change in one transaction.

import { revalidatePath } from "next/cache";
import { getCurrentRole } from "@/lib/auth/role";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { UUID_RE } from "./rules";
import type { AdminResult, MoveDirection } from "./types";

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
