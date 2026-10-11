import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { FeedItem } from "./feed";

const CHUNK = 100; // keeps the PostgREST `in.(...)` URL well under length limits

// Every track id on a feed page: singles and album tracks, in feed order.
export function feedTrackIds(items: FeedItem[]): string[] {
  return items.flatMap((i) => (i.kind === "album" ? i.tracks.map((t) => t.id) : [i.id]));
}

// Which of `trackIds` the signed-in user has downloaded. Must be called with the
// user (cookie) client: the downloads RLS policy is owner-only, so no user_id
// filter is needed. If a label-member read policy is ever added to downloads,
// add `.eq("user_id", <caller>)` here (pass-2 stats use a definer function instead).
// Fails soft: on error the page still renders, buttons just show "↓".
export async function getMyDownloadedTrackIds(
  supabase: SupabaseClient<Database>,
  trackIds: string[],
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < trackIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("downloads")
      .select("track_id")
      .in("track_id", trackIds.slice(i, i + CHUNK));
    if (error || !data) {
      console.error("Failed to load downloaded track ids", error);
      return [];
    }
    out.push(...data.map((r) => r.track_id));
  }
  return out;
}
