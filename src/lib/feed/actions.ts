"use server";

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getFeed, getFeedAfterRelease, type ReleaseRef } from "@/lib/supabase/feed";
import { feedQueue, type PlayerTrack } from "@/components/Player/queue";

// The player calls these itself (not via a page render) so playback can move
// to the next page while the phone is locked and navigation can't run.
export type QueuePage = { tracks: PlayerTrack[]; page: number; hasMore: boolean; error: string | null };

export async function loadFeedPage({ q, page }: { q: string; page: number }): Promise<QueuePage> {
  const claims = await getSessionUser();
  if (!claims) return { tracks: [], page, hasMore: false, error: "Not authenticated." };
  try {
    const supabase = await createClient();
    const feed = await getFeed(supabase, { q, page });
    return { tracks: feedQueue(feed.items, feed.page).tracks, page: feed.page, hasMore: feed.hasMore, error: null };
  } catch (err) {
    console.error("Failed to load feed page", err);
    return { tracks: [], page, hasMore: false, error: "Could not load more tracks." };
  }
}

// What follows a release in the main feed (an album-page queue, or a search
// queue that ran out). Always the plain feed, never the search.
export async function continueAfterRelease(ref: ReleaseRef): Promise<QueuePage> {
  const claims = await getSessionUser();
  if (!claims) return { tracks: [], page: 0, hasMore: false, error: "Not authenticated." };
  try {
    const supabase = await createClient();
    const after = await getFeedAfterRelease(supabase, ref);
    if (!after) return { tracks: [], page: 0, hasMore: false, error: null };
    return { tracks: feedQueue(after.items, after.page).tracks, page: after.page, hasMore: after.hasMore, error: null };
  } catch (err) {
    console.error("Failed to continue after release", err);
    return { tracks: [], page: 0, hasMore: false, error: "Could not load more tracks." };
  }
}
