// src/lib/supabase/update-release.data.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { admin, cleanup, makeAlbum, makeArtist, makeSingle, newTag, positions, signedIn } from "./release-admin-fixtures";

let tag = "";
afterEach(() => cleanup(tag));

async function credits(table: "track_artists" | "album_artists", key: "track_id" | "album_id", id: string) {
  const { data } = await admin.from(table).select("artist_id, position").eq(key, id).order("position");
  return (data ?? []).map((r) => r.artist_id as string);
}

describe("update_release", () => {
  it("refuses non-label-members", async () => {
    tag = newTag("UPD");
    const { releaseId, trackId } = await makeSingle(tag);
    const client = await signedIn("listener");
    const { error } = await client.rpc("update_release", {
      p_release_id: releaseId,
      payload: { tracks: [{ id: trackId, title: "x", artists: [{ newName: `${tag}-X` }] }] },
    });
    expect(error?.code).toBe("42501");
  });

  it("edits a single's title and ordered artists, reusing an existing artist case-insensitively", async () => {
    tag = newTag("UPD");
    const { releaseId, trackId } = await makeSingle(tag);
    const nova = await makeArtist(`${tag}-Nova`);
    const client = await signedIn();
    const { error } = await client.rpc("update_release", {
      p_release_id: releaseId,
      payload: {
        tracks: [{ id: trackId, title: `  ${tag}-Renamed `, artists: [{ newName: `${tag}-Fresh` }, { newName: `${tag}-NOVA`.toUpperCase() }] }],
      },
    });
    expect(error).toBeNull();
    const { data: t } = await admin.from("tracks").select("title").eq("id", trackId).single();
    expect(t!.title).toBe(`${tag}-Renamed`);
    const ids = await credits("track_artists", "track_id", trackId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(nova);
  });

  it("edits an album: title, album artists, track order; removed tracks go after live ones", async () => {
    tag = newTag("UPD");
    const { releaseId, albumId, trackIds } = await makeAlbum(tag, 4);
    const [a, b, c, d] = trackIds;
    await admin.from("tracks").update({ archived_at: "2020-01-01T00:00:00Z" }).eq("id", b); // removed, position 2
    const client = await signedIn();
    const { error } = await client.rpc("update_release", {
      p_release_id: releaseId,
      payload: {
        album: { title: `${tag}-New Album`, artists: [{ newName: `${tag}-AlbumArtist` }] },
        tracks: [
          { id: d, title: `${tag}-D`, artists: [{ newName: `${tag}-A4` }] },
          { id: a, title: `${tag}-A`, artists: [{ newName: `${tag}-A1` }] },
          { id: c, title: `${tag}-C`, artists: [{ newName: `${tag}-A3` }] },
        ],
      },
    });
    expect(error).toBeNull();
    expect(await positions(albumId)).toEqual([d, a, c, b]);
    const { data: album } = await admin.from("albums").select("title").eq("id", albumId).single();
    expect(album!.title).toBe(`${tag}-New Album`);
    expect(await credits("album_artists", "album_id", albumId)).toHaveLength(1);
  });

  it("refuses a stale draft (missing, extra, or duplicate track ids)", async () => {
    tag = newTag("UPD");
    const { releaseId, trackIds } = await makeAlbum(tag, 2);
    const client = await signedIn();
    const track = (id: string) => ({ id, title: `${tag}-x`, artists: [{ newName: `${tag}-X` }] });
    const album = { title: `${tag}-Album`, artists: [] };
    for (const tracks of [[track(trackIds[0])], [track(trackIds[0]), track(trackIds[0])], [track(trackIds[0]), track(trackIds[1]), track("00000000-0000-4000-8000-000000000000")]]) {
      const { error } = await client.rpc("update_release", { p_release_id: releaseId, payload: { album, tracks } });
      expect([error?.code, error?.message]).toEqual(["22023", "This release changed since you opened it. Reload the page."]);
    }
  });

  it("refuses blank titles, album details on a single, and archived releases", async () => {
    tag = newTag("UPD");
    const single = await makeSingle(`${tag}S`);
    const album = await makeAlbum(tag, 2);
    const client = await signedIn();
    const artists = [{ newName: `${tag}-X` }];

    const blankTrack = await client.rpc("update_release", {
      p_release_id: single.releaseId,
      payload: { tracks: [{ id: single.trackId, title: "   ", artists }] },
    });
    expect([blankTrack.error?.code, blankTrack.error?.message]).toEqual(["22023", "Track 1 needs a title."]);

    const albumOnSingle = await client.rpc("update_release", {
      p_release_id: single.releaseId,
      payload: { album: { title: "x", artists: [] }, tracks: [{ id: single.trackId, title: "x", artists }] },
    });
    expect([albumOnSingle.error?.code, albumOnSingle.error?.message]).toEqual(["22023", "A single has no album details."]);

    const blankAlbum = await client.rpc("update_release", {
      p_release_id: album.releaseId,
      payload: { album: { title: "  ", artists: [] }, tracks: album.trackIds.map((id) => ({ id, title: "x", artists })) },
    });
    expect([blankAlbum.error?.code, blankAlbum.error?.message]).toEqual(["22023", "Album title is required."]);

    await client.rpc("archive_release", { p_release_id: single.releaseId });
    const archived = await client.rpc("update_release", {
      p_release_id: single.releaseId,
      payload: { tracks: [{ id: single.trackId, title: "x", artists }] },
    });
    expect([archived.error?.code, archived.error?.message]).toEqual(["22023", "Restore this release before editing it."]);
  });
});
