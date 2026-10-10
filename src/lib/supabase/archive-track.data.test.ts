// src/lib/supabase/archive-track.data.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { admin, archivedAt, cleanup, makeAlbum, makeSingle, newTag, queueRows, signedIn } from "./release-admin-fixtures";

let tag = "";
afterEach(() => cleanup(tag));

describe("archive_track", () => {
  it("refuses non-label-members", async () => {
    tag = newTag("ATR");
    const { trackIds } = await makeAlbum(tag, 2);
    const client = await signedIn("listener");
    expect((await client.rpc("archive_track", { p_track_id: trackIds[0] })).error?.code).toBe("42501");
  });

  it("refuses a single's track", async () => {
    tag = newTag("ATR");
    const { trackId } = await makeSingle(tag);
    const client = await signedIn();
    const { error } = await client.rpc("archive_track", { p_track_id: trackId });
    expect(error?.code).toBe("22023");
    expect(error?.message).toBe("Archive the single instead.");
  });

  it("raises P0002 for an unknown track", async () => {
    tag = newTag("ATR");
    const client = await signedIn();
    const { error } = await client.rpc("archive_track", { p_track_id: "00000000-0000-4000-8000-000000000000" });
    expect(error?.code).toBe("P0002");
  });

  it("archives one album track, queues its audio, leaves the album live; second call is a no-op", async () => {
    tag = newTag("ATR");
    const { releaseId, trackIds } = await makeAlbum(tag, 2);
    const client = await signedIn();
    expect((await client.rpc("archive_track", { p_track_id: trackIds[0] })).error).toBeNull();
    expect((await client.rpc("archive_track", { p_track_id: trackIds[0] })).error).toBeNull();
    expect((await archivedAt("tracks", [trackIds[0]])).get(trackIds[0])).not.toBeNull();
    expect((await archivedAt("releases", [releaseId])).get(releaseId)).toBeNull();
    expect((await queueRows(tag)).map((r) => [r.object_key, r.reason])).toEqual([[`tracks/${tag}-1.mp3`, "archived"]]);
  });

  it("archiving the last live track archives the album with the same timestamp", async () => {
    tag = newTag("ATR");
    const { releaseId, albumId, trackIds } = await makeAlbum(tag, 2, { albumArt: true });
    const client = await signedIn();
    await client.rpc("archive_track", { p_track_id: trackIds[0] });
    expect((await client.rpc("archive_track", { p_track_id: trackIds[1] })).error).toBeNull();
    const relAt = (await archivedAt("releases", [releaseId])).get(releaseId);
    expect(relAt).not.toBeNull();
    expect((await archivedAt("tracks", [trackIds[1]])).get(trackIds[1])).toBe(relAt);
    expect((await queueRows(tag)).some((r) => r.source_table === "albums" && r.source_id === albumId)).toBe(true);

    // Restoring the album brings back only the last track (archived with it).
    expect((await client.rpc("restore_release", { p_release_id: releaseId })).error).toBeNull();
    const tracks = await archivedAt("tracks", trackIds);
    expect(tracks.get(trackIds[1])).toBeNull();
    expect(tracks.get(trackIds[0])).not.toBeNull();
  });

  it("refuses a track on an archived album", async () => {
    tag = newTag("ATR");
    const { releaseId, trackIds } = await makeAlbum(tag, 2);
    const client = await signedIn();
    await client.rpc("archive_release", { p_release_id: releaseId });
    const { error } = await client.rpc("archive_track", { p_track_id: trackIds[0] });
    expect(error?.code).toBe("22023");
    expect(error?.message).toBe("This album is archived.");
  });
});

describe("restore_track", () => {
  it("refuses non-label-members", async () => {
    tag = newTag("RTR");
    const { trackIds } = await makeAlbum(tag, 2);
    const client = await signedIn("listener");
    expect((await client.rpc("restore_track", { p_track_id: trackIds[0] })).error?.code).toBe("42501");
  });

  it("restores a removed track and drops its queue rows", async () => {
    tag = newTag("RTR");
    const { trackIds } = await makeAlbum(tag, 2);
    const client = await signedIn();
    await client.rpc("archive_track", { p_track_id: trackIds[0] });
    expect((await client.rpc("restore_track", { p_track_id: trackIds[0] })).error).toBeNull();
    expect((await archivedAt("tracks", [trackIds[0]])).get(trackIds[0])).toBeNull();
    expect(await queueRows(tag)).toEqual([]);
  });

  it("refuses while the album is archived", async () => {
    tag = newTag("RTR");
    const { releaseId, trackIds } = await makeAlbum(tag, 2);
    const client = await signedIn();
    await client.rpc("archive_release", { p_release_id: releaseId });
    const { error } = await client.rpc("restore_track", { p_track_id: trackIds[0] });
    expect(error?.code).toBe("22023");
    expect(error?.message).toBe("Restore the album first.");
  });

  it("refuses when the track's file was already cleaned", async () => {
    tag = newTag("RTR");
    const { trackIds } = await makeAlbum(tag, 2);
    const client = await signedIn();
    await client.rpc("archive_track", { p_track_id: trackIds[0] });
    await admin.from("r2_cleanup_queue").update({ cleaned_at: new Date().toISOString() }).eq("object_key", `tracks/${tag}-1.mp3`);
    const { error } = await client.rpc("restore_track", { p_track_id: trackIds[0] });
    expect(error?.code).toBe("22023");
    expect(error?.message).toBe("This track's file was already deleted from storage.");
  });
});
