"use server";

// Artist admin writes. Every action re-checks the caller's role (the /admin
// layout doesn't protect server actions). Insert/update use the cookie
// client, so the label-member RLS policies enforce the role in Postgres too;
// delete goes through admin_delete_artist (queues the photo key atomically).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/auth/role";
import { createClient } from "@/lib/supabase/server";
import { filterLinkableUsers, getCreditCounts, loadLinkTargets } from "./artists";
import {
  MAX_ARTIST_NAME_LENGTH,
  MAX_BIO_LENGTH,
  creditMessage,
  type ArtistActionResult,
  type ArtistInput,
  type LinkableUsersResult,
} from "./artists-types";

const FORBIDDEN = "Only label members can do this.";
const GONE = "That artist no longer exists.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUERY_LENGTH = 100;

type Row = { name: string; bio: string | null; user_id: string | null };
type DbError = { code?: string; message: string };

async function isLabelMember(): Promise<boolean> {
  return (await getCurrentRole()) === "label_member";
}

function parseInput(input: ArtistInput): { row: Row } | { error: string } {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) return { error: "Enter a name." };
  if (name.length > MAX_ARTIST_NAME_LENGTH) return { error: `Names must be ${MAX_ARTIST_NAME_LENGTH} characters or fewer.` };
  const bio = typeof input.bio === "string" ? input.bio.trim() : "";
  if (bio.length > MAX_BIO_LENGTH) return { error: `Bios must be ${MAX_BIO_LENGTH} characters or fewer.` };
  const userId = input.userId ?? null;
  if (userId !== null && (typeof userId !== "string" || !UUID_RE.test(userId))) {
    return { error: "Pick a user from the list." };
  }
  return { row: { name, bio: bio || null, user_id: userId } };
}

function writeError(error: DbError, name: string): string {
  if (error.code === "23505" && error.message.includes("artists_user_id_key")) {
    return "That user is already linked to another artist.";
  }
  if (error.code === "23505") return `An artist named "${name}" already exists.`;
  if (error.code === "42501") return FORBIDDEN;
  console.error("Artist write failed", error);
  return "Couldn't save. Try again.";
}

function revalidateArtist(id?: string) {
  revalidatePath("/admin/artists");
  if (id) revalidatePath(`/admin/artists/${id}`);
  revalidatePath("/feed");
}

export async function createArtist(input: ArtistInput): Promise<ArtistActionResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  const parsed = parseInput(input);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.from("artists").insert(parsed.row).select("id").single();
  if (error || !data) return { error: writeError(error ?? { message: "no row" }, parsed.row.name) };

  revalidateArtist();
  // redirect() throws to navigate; keep it outside any try/catch.
  redirect(`/admin/artists/${data.id}`);
}

export async function updateArtist(id: string, input: ArtistInput): Promise<ArtistActionResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: GONE };
  const parsed = parseInput(input);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.from("artists").update(parsed.row).eq("id", id).select("id");
  if (error) return { error: writeError(error, parsed.row.name) };
  if (!data || data.length === 0) return { error: GONE };

  revalidateArtist(id);
  return { error: null };
}

export async function deleteArtist(id: string): Promise<ArtistActionResult> {
  if (!(await isLabelMember())) return { error: FORBIDDEN };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: GONE };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_artist", { target: id });
  if (error) {
    if (error.code === "23503") {
      try {
        const { tracks, albums } = await getCreditCounts(supabase, id);
        return { error: creditMessage(tracks, albums) };
      } catch {
        return { error: "This artist still has credits. Remove those credits first." };
      }
    }
    if (error.code === "P0002") return { error: GONE };
    if (error.code === "42501") return { error: FORBIDDEN };
    console.error("admin_delete_artist failed", error);
    return { error: "Couldn't delete. Try again." };
  }

  revalidateArtist();
  redirect("/admin/artists");
}

export async function searchLinkableUsers(query: string, artistId?: string): Promise<LinkableUsersResult> {
  if (!(await isLabelMember())) return { users: [], error: FORBIDDEN };
  const q = typeof query === "string" ? query.trim().slice(0, MAX_QUERY_LENGTH) : "";
  if (!q) return { users: [], error: null };
  try {
    const targets = await loadLinkTargets(await createClient());
    return { users: filterLinkableUsers(targets, q, artistId), error: null };
  } catch (err) {
    console.error("Linkable user search failed", err);
    return { users: [], error: "Search failed." };
  }
}
