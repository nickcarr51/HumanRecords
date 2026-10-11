// The player's queue, as plain data + pure functions. No 'use client': the
// feed server actions build PlayerTracks with these too.
import type { FeedItem, ReleaseRef } from "@/lib/supabase/feed";

// `page` is the feed page the track came from (absent on the album page).
// `from` is the release it belongs to (set by feedQueue), so a search queue
// that runs out can continue in the main feed after its last release.
export type PlayerTrack = { id: string; title: string; artistName: string; page?: number; from?: ReleaseRef };

export function toPlayerTrack(
  t: { id: string; title: string; artistNames: string[] },
  page?: number,
  from?: ReleaseRef,
): PlayerTrack {
  return {
    id: t.id,
    title: t.title,
    artistName: t.artistNames.length ? t.artistNames.join(", ") : "Unknown Artist",
    ...(page !== undefined ? { page } : {}),
    ...(from !== undefined ? { from } : {}),
  };
}

// One queue for a feed page, in feed order, so next/prev move from release to
// release. offsets[i] is where items[i]'s first track sits in the queue.
export function feedQueue(items: FeedItem[], page?: number): { tracks: PlayerTrack[]; offsets: number[] } {
  const tracks: PlayerTrack[] = [];
  const offsets: number[] = [];
  for (const item of items) {
    offsets.push(tracks.length);
    if (item.kind === "album") {
      const from: ReleaseRef = { kind: "album", albumId: item.id };
      tracks.push(...item.tracks.map((tr) => toPlayerTrack(tr, page, from)));
    } else tracks.push(toPlayerTrack(item, page, { kind: "single", trackId: item.id }));
  }
  return { tracks, offsets };
}

// Where the queue came from, which decides what plays after its last track.
export type QueueSource =
  // A search (q non-empty) with no more pages continues into the main feed
  // after its last track's release.
  | { kind: "feed"; q: string; lastPage: number; hasMore: boolean }
  | { kind: "album"; albumId: string } // album page: continues into the feed after the album
  | { kind: "none" };

export type QueueState = { tracks: PlayerTrack[]; index: number; source: QueueSource };

export const EMPTY_QUEUE: QueueState = { tracks: [], index: 0, source: { kind: "none" } };

export type Advance = { kind: "moved"; state: QueueState } | { kind: "needsMore" } | { kind: "end" };

export function startQueue(tracks: PlayerTrack[], startIndex: number, source: QueueSource): QueueState {
  return { tracks, index: Math.max(0, Math.min(startIndex, tracks.length - 1)), source };
}

// A finished search continues into the main feed.
export function isFinishedSearch(source: QueueSource): boolean {
  return source.kind === "feed" && !source.hasMore && source.q.trim() !== "";
}

export function canExtend(source: QueueSource): boolean {
  return (source.kind === "feed" && source.hasMore) || source.kind === "album" || isFinishedSearch(source);
}

export function advance(state: QueueState): Advance {
  if (state.index < state.tracks.length - 1) {
    return { kind: "moved", state: { ...state, index: state.index + 1 } };
  }
  return canExtend(state.source) ? { kind: "needsMore" } : { kind: "end" };
}

export function back(state: QueueState): QueueState {
  return state.index > 0 ? { ...state, index: state.index - 1 } : state;
}

// Adds a fetched page. Tracks already queued are skipped: if a release was
// published or moved mid-session the pages shift, and a track can reappear.
// `q` is the search the page came from; it defaults to the current one (""
// for an album source). A continuation into the main feed passes "".
export function appendPage(
  state: QueueState,
  tracks: PlayerTrack[],
  page: number,
  hasMore: boolean,
  q: string = state.source.kind === "feed" ? state.source.q : "",
): QueueState {
  const seen = new Set(state.tracks.map((t) => t.id));
  const fresh = tracks.filter((t) => !seen.has(t.id));
  return {
    ...state,
    tracks: [...state.tracks, ...fresh],
    source: { kind: "feed", q, lastPage: page, hasMore },
  };
}
