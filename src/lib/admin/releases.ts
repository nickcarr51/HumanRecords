// src/lib/admin/releases.ts
// Reads for the release admin pages. Uses the caller's (label member's)
// client: RLS lets label members read archived rows, which these pages list.
// Kept out of feed.ts, which only serves listeners.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { byPosition } from "@/lib/supabase/artist-names";
import { UUID_RE } from "./rules";
import type { ArtistMatch, ReleaseKind } from "./types";

export type AdminReleaseRow = {
  id: string;
  kind: ReleaseKind;
  title: string;
  artistNames: string[];
  createdAt: string;
  pinned: boolean;
  archived: boolean;
  liveTrackCount: number;
};
export type AdminTrack = { id: string; title: string; artists: ArtistMatch[]; archived: boolean };
export type AdminRelease = {
  id: string;
  kind: ReleaseKind;
  title: string;
  pinned: boolean;
  archived: boolean;
  album: { title: string; artists: ArtistMatch[] } | null;
  tracks: AdminTrack[];
};

const SELECT = `
  id, kind, created_at, pinned, sort_at, archived_at,
  track:tracks ( id, title, archived_at, track_artists ( position, artists ( id, name ) ) ),
  album:albums (
    id, title,
    album_artists ( position, artists ( id, name ) ),
    track_albums ( position, tracks ( id, title, archived_at, track_artists ( position, artists ( id, name ) ) ) )
  )
`;

type ArtistRel = Array<{ position?: number | null; artists: ArtistMatch | null }> | null;
type TrackRel = { id: string; title: string; archived_at: string | null; track_artists: ArtistRel };
type Row = {
  id: string;
  kind: ReleaseKind;
  created_at: string;
  pinned: boolean;
  archived_at: string | null;
  track: TrackRel | null;
  album: {
    id: string;
    title: string;
    album_artists: ArtistRel;
    track_albums: Array<{ position: number; tracks: TrackRel | null }> | null;
  } | null;
};

function artistsFrom(rel: ArtistRel): ArtistMatch[] {
  return byPosition(rel ?? [])
    .map((r) => r.artists)
    .filter((a): a is ArtistMatch => a !== null)
    .map((a) => ({ id: a.id, name: a.name }));
}

function toTrack(t: TrackRel): AdminTrack {
  return { id: t.id, title: t.title, artists: artistsFrom(t.track_artists), archived: t.archived_at !== null };
}

function toAdminRelease(row: Row): AdminRelease | null {
  const base = { id: row.id, pinned: row.pinned, archived: row.archived_at !== null };
  if (row.kind === "single" && row.track) {
    return { ...base, kind: "single", title: row.track.title, album: null, tracks: [toTrack(row.track)] };
  }
  if (row.kind === "album" && row.album) {
    const tracks = byPosition(row.album.track_albums ?? [])
      .map((ta) => ta.tracks)
      .filter((t): t is TrackRel => t !== null)
      .map(toTrack);
    return {
      ...base,
      kind: "album",
      title: row.album.title,
      album: { title: row.album.title, artists: artistsFrom(row.album.album_artists) },
      tracks,
    };
  }
  return null;
}

export async function getAdminReleases(supabase: SupabaseClient<Database>): Promise<AdminReleaseRow[]> {
  const { data, error } = await supabase
    .from("releases")
    .select(SELECT)
    .order("pinned", { ascending: false })
    .order("sort_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;

  const rows: AdminReleaseRow[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const r = toAdminRelease(row);
    if (!r) continue;
    rows.push({
      id: r.id,
      kind: r.kind,
      title: r.title,
      artistNames: (r.album ? r.album.artists : r.tracks[0].artists).map((a) => a.name),
      createdAt: row.created_at,
      pinned: r.pinned,
      archived: r.archived,
      liveTrackCount: r.tracks.filter((t) => !t.archived).length,
    });
  }
  return rows;
}

export async function getAdminRelease(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<AdminRelease | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase.from("releases").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toAdminRelease(data as unknown as Row) : null;
}
