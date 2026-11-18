// src/lib/supabase/track-one-place.data.test.ts
// Migration 20261115120000: a track belongs to at most one release, and
// tracks.archived_with_release exists with a false default.
import { afterEach, describe, expect, it } from "vitest";
import { admin, cleanup, makeAlbum, makeSingle, newTag } from "./release-admin-fixtures";

let tag = "";
afterEach(() => cleanup(tag));

const ONE_PLACE = ["23505", "A track can belong to only one release."];

async function newTrack(title: string): Promise<string> {
  const { data, error } = await admin.from("tracks").insert({ title, audio_url: `tracks/${title}.mp3` }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

describe("one track in one place", () => {
  it("refuses an album track on a second album", async () => {
    tag = newTag("ONE");
    const first = await makeAlbum(tag, 1);
    const second = await makeAlbum(`${tag}B`, 1);
    const { error } = await admin.from("track_albums").insert({ track_id: first.trackIds[0], album_id: second.albumId, position: 2 });
    expect(error?.code).toBe("23505");
  });

  it("refuses a single's track on an album", async () => {
    tag = newTag("ONE");
    const { trackId } = await makeSingle(tag);
    const { albumId } = await makeAlbum(`${tag}B`, 1);
    const { error } = await admin.from("track_albums").insert({ track_id: trackId, album_id: albumId, position: 2 });
    expect([error?.code, error?.message]).toEqual(ONE_PLACE);
  });

  it("refuses an album track as a new single, or as an existing single's track", async () => {
    tag = newTag("ONE");
    const { trackIds } = await makeAlbum(tag, 1);
    const asNew = await admin.from("releases").insert({ kind: "single", track_id: trackIds[0] });
    expect([asNew.error?.code, asNew.error?.message]).toEqual(ONE_PLACE);
    const { releaseId } = await makeSingle(`${tag}S`);
    const swapped = await admin.from("releases").update({ track_id: trackIds[0] }).eq("id", releaseId);
    expect([swapped.error?.code, swapped.error?.message]).toEqual(ONE_PLACE);
  });

  it("refuses re-pointing an album link at a single's track", async () => {
    tag = newTag("ONE");
    const { albumId, trackIds } = await makeAlbum(tag, 1);
    const { trackId } = await makeSingle(`${tag}S`);
    const { error } = await admin
      .from("track_albums")
      .update({ track_id: trackId })
      .eq("album_id", albumId)
      .eq("track_id", trackIds[0]);
    expect([error?.code, error?.message]).toEqual(ONE_PLACE);
  });

  it("still links new tracks: onto an album and as a single", async () => {
    tag = newTag("ONE");
    const { albumId } = await makeAlbum(tag, 1);
    const onAlbum = await newTrack(`${tag}-new-album`);
    expect((await admin.from("track_albums").insert({ track_id: onAlbum, album_id: albumId, position: 2 })).error).toBeNull();
    const asSingle = await newTrack(`${tag}-new-single`);
    expect((await admin.from("releases").insert({ kind: "single", track_id: asSingle })).error).toBeNull();
  });
});

describe("tracks.archived_with_release", () => {
  it("is false on a new track", async () => {
    tag = newTag("ONE");
    const id = await newTrack(`${tag}-flag`);
    const { data, error } = await admin.from("tracks").select("archived_with_release").eq("id", id).single();
    if (error) throw error;
    expect(data.archived_with_release).toBe(false);
  });
});
