// src/lib/supabase/archive-release.data.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { admin, archivedAt, cleanup, makeAlbum, makeSingle, newTag, queueRows, signedIn } from "./release-admin-fixtures";

let tag = "";
afterEach(() => cleanup(tag));

async function shareTrackOnSecondAlbum(tag: string, trackId: string) {
  const { data: album, error } = await admin.from("albums").insert({ title: `${tag}-AlbumB` }).select("id").single();
  if (error) throw error;
  const { error: link } = await admin.from("track_albums").insert({ track_id: trackId, album_id: album.id, position: 1 });
  if (link) throw link;
  const { error: rel } = await admin.from("releases").insert({ kind: "album", album_id: album.id });
  if (rel) throw rel;
}

describe("archive_release", () => {
  it("refuses non-label-members", async () => {
    tag = newTag("ARC");
    const { releaseId } = await makeSingle(tag);
    const client = await signedIn("listener");
    const { error } = await client.rpc("archive_release", { p_release_id: releaseId });
    expect(error?.code).toBe("42501");
    expect((await archivedAt("releases", [releaseId])).get(releaseId)).toBeNull();
  });

  it("raises P0002 for an unknown release", async () => {
    tag = newTag("ARC");
    const client = await signedIn();
    const { error } = await client.rpc("archive_release", { p_release_id: "00000000-0000-4000-8000-000000000000" });
    expect(error?.code).toBe("P0002");
  });

  it("archives a single and its track with one timestamp and queues audio + art", async () => {
    tag = newTag("ARC");
    const { releaseId, trackId } = await makeSingle(tag, { art: true });
    const client = await signedIn();
    expect((await client.rpc("archive_release", { p_release_id: releaseId })).error).toBeNull();
    const at = (await archivedAt("releases", [releaseId])).get(releaseId);
    expect(at).not.toBeNull();
    expect((await archivedAt("tracks", [trackId])).get(trackId)).toBe(at);
    expect(await queueRows(tag)).toEqual([
      { object_key: `art/${tag}-1.jpg`, reason: "archived", source_table: "tracks", source_id: trackId, cleaned_at: null },
      { object_key: `tracks/${tag}-1.mp3`, reason: "archived", source_table: "tracks", source_id: trackId, cleaned_at: null },
    ]);
  });

  it("archives an album and its live tracks, queues album art, leaves earlier-removed tracks alone", async () => {
    tag = newTag("ARC");
    const { releaseId, albumId, trackIds } = await makeAlbum(tag, 3, { albumArt: true });
    await admin.from("tracks").update({ archived_at: "2020-01-01T00:00:00Z" }).eq("id", trackIds[2]);
    const client = await signedIn();
    expect((await client.rpc("archive_release", { p_release_id: releaseId })).error).toBeNull();
    const at = (await archivedAt("releases", [releaseId])).get(releaseId);
    const tracks = await archivedAt("tracks", trackIds);
    expect(tracks.get(trackIds[0])).toBe(at);
    expect(tracks.get(trackIds[1])).toBe(at);
    expect(new Date(tracks.get(trackIds[2])!).toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect((await queueRows(tag)).map((r) => [r.object_key, r.source_table, r.source_id])).toEqual([
      [`art/${tag}-album.jpg`, "albums", albumId],
      [`tracks/${tag}-1.mp3`, "tracks", trackIds[0]],
      [`tracks/${tag}-2.mp3`, "tracks", trackIds[1]],
    ]);
  });

  it("is a no-op the second time (no duplicate queue rows)", async () => {
    tag = newTag("ARC");
    const { releaseId } = await makeSingle(tag);
    const client = await signedIn();
    await client.rpc("archive_release", { p_release_id: releaseId });
    const first = (await archivedAt("releases", [releaseId])).get(releaseId);
    expect((await client.rpc("archive_release", { p_release_id: releaseId })).error).toBeNull();
    expect((await archivedAt("releases", [releaseId])).get(releaseId)).toBe(first);
    expect(await queueRows(tag)).toHaveLength(1);
  });
});

describe("restore_release", () => {
  it("refuses non-label-members", async () => {
    tag = newTag("RST");
    const { releaseId } = await makeSingle(tag);
    const client = await signedIn("listener");
    expect((await client.rpc("restore_release", { p_release_id: releaseId })).error?.code).toBe("42501");
  });

  it("restores the release and only the tracks archived with it, and drops their queue rows", async () => {
    tag = newTag("RST");
    const { releaseId, trackIds } = await makeAlbum(tag, 3, { albumArt: true });
    await admin.from("tracks").update({ archived_at: "2020-01-01T00:00:00Z" }).eq("id", trackIds[2]);
    const client = await signedIn();
    await client.rpc("archive_release", { p_release_id: releaseId });
    expect((await client.rpc("restore_release", { p_release_id: releaseId })).error).toBeNull();
    expect((await archivedAt("releases", [releaseId])).get(releaseId)).toBeNull();
    const tracks = await archivedAt("tracks", trackIds);
    expect(tracks.get(trackIds[0])).toBeNull();
    expect(tracks.get(trackIds[1])).toBeNull();
    expect(tracks.get(trackIds[2])).not.toBeNull();
    expect(await queueRows(tag)).toEqual([]);
  });

  it("is a no-op for a live release", async () => {
    tag = newTag("RST");
    const { releaseId } = await makeSingle(tag);
    const client = await signedIn();
    expect((await client.rpc("restore_release", { p_release_id: releaseId })).error).toBeNull();
  });

  it("refuses when a file was already cleaned from storage", async () => {
    tag = newTag("RST");
    const { releaseId } = await makeSingle(tag);
    const client = await signedIn();
    await client.rpc("archive_release", { p_release_id: releaseId });
    await admin.from("r2_cleanup_queue").update({ cleaned_at: new Date().toISOString() }).eq("object_key", `tracks/${tag}-1.mp3`);
    const { error } = await client.rpc("restore_release", { p_release_id: releaseId });
    expect(error?.code).toBe("22023");
    expect(error?.message).toBe("Some files for this release were already deleted from storage; it can't be restored.");
    expect((await archivedAt("releases", [releaseId])).get(releaseId)).not.toBeNull();
  });

  it("refuses to archive an album whose track is shared with another release", async () => {
    tag = newTag("ARC");
    const { releaseId, trackIds } = await makeAlbum(tag, 2);
    await shareTrackOnSecondAlbum(tag, trackIds[0]);
    const client = await signedIn();
    const { error } = await client.rpc("archive_release", { p_release_id: releaseId });
    expect([error?.code, error?.message]).toEqual(["22023", "A track on this release also belongs to another release."]);
    expect((await archivedAt("releases", [releaseId])).get(releaseId)).toBeNull();
    for (const v of (await archivedAt("tracks", trackIds)).values()) expect(v).toBeNull();
    expect(await queueRows(tag)).toEqual([]);
  });
});
