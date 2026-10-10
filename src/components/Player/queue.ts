// The player's queue, as plain data + pure functions. No 'use client': the
// feed server actions build PlayerTracks with these too.
import type { FeedItem } from "@/lib/supabase/feed";

// `page` is the feed page the track came from (absent on the album page).
export type PlayerTrack = { id: string; title: string; artistName: string; page?: number };

export function toPlayerTrack(
  t: { id: string; title: string; artistNames: string[] },
  page?: number,
): PlayerTrack {
  return {
    id: t.id,
    title: t.title,
    artistName: t.artistNames.length ? t.artistNames.join(", ") : "Unknown Artist",
    ...(page !== undefined ? { page } : {}),
  };
}

// One queue for a feed page, in feed order, so next/prev move from release to
// release. offsets[i] is where items[i]'s first track sits in the queue.
export function feedQueue(items: FeedItem[], page?: number): { tracks: PlayerTrack[]; offsets: number[] } {
  const tracks: PlayerTrack[] = [];
  const offsets: number[] = [];
  for (const item of items) {
    offsets.push(tracks.length);
    if (item.kind === "album") tracks.push(...item.tracks.map((tr) => toPlayerTrack(tr, page)));
    else tracks.push(toPlayerTrack(item, page));
  }
  return { tracks, offsets };
}

// Where the queue came from, which decides what plays after its last track.
export type QueueSource =
  | { kind: "feed"; q: string; lastPage: number; hasMore: boolean }
  | { kind: "album"; albumId: string } // album page: continues into the feed after the album
  | { kind: "none" };

export type QueueState = { tracks: PlayerTrack[]; index: number; source: QueueSource };

export const EMPTY_QUEUE: QueueState = { tracks: [], index: 0, source: { kind: "none" } };

export type Advance = { kind: "moved"; state: QueueState } | { kind: "needsMore" } | { kind: "end" };

export function startQueue(tracks: PlayerTrack[], startIndex: number, source: QueueSource): QueueState {
  return { tracks, index: Math.max(0, Math.min(startIndex, tracks.length - 1)), source };
}

export function canExtend(source: QueueSource): boolean {
  return (source.kind === "feed" && source.hasMore) || source.kind === "album";
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
export function appendPage(
  state: QueueState,
  tracks: PlayerTrack[],
  page: number,
  hasMore: boolean,
): QueueState {
  const seen = new Set(state.tracks.map((t) => t.id));
  const fresh = tracks.filter((t) => !seen.has(t.id));
  const q = state.source.kind === "feed" ? state.source.q : "";
  return {
    ...state,
    tracks: [...state.tracks, ...fresh],
    source: { kind: "feed", q, lastPage: page, hasMore },
  };
}
