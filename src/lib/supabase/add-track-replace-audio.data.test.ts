// src/lib/supabase/add-track-replace-audio.data.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { archiveRelease, archiveTrack } from "@/lib/services/releases";
import { getViewer } from "@/lib/services/viewer";
import { admin, cleanup, makeAlbum, makeArtist, makeSingle, newTag, positions, signedIn } from "./release-admin-fixtures";

let tag = "";
afterEach(() => cleanup(tag));

describe("add_album_track", () => {
  it("refuses non-label-members", async () => {
    tag = newTag("ADD");
    const { releaseId } = await makeAlbum(tag, 2);
    const client = await signedIn("listener");
    const { error } = await client.rpc("add_album_track", {
      p_release_id: releaseId,
      payload: { title: `${tag}-New`, audioKey: `tracks/${tag}-new.mp3`, artists: [{ newName: `${tag}-X` }] },
    });
    expect(error?.code).toBe("42501");
  });

  it("adds after every existing track (even removed ones) and reuses an artist case-insensitively", async () => {
    tag = newTag("ADD");
    const { releaseId, albumId, trackIds } = await makeAlbum(tag, 2);
    const nova = await makeArtist(`${tag}-Nova`);
    const client = await signedIn();
    await archiveTrack(await getViewer(client), trackIds[1]);
    const { data: newId, error } = await client.rpc("add_album_track", {
      p_release_id: releaseId,
      payload: {
        title: `  ${tag}-New  `,
        audioKey: `tracks/${tag}-new.mp3`,
        artists: [{ newName: `${tag}-NOVA`.toUpperCase() }, { newName: `${tag}-Fresh` }],
      },
    });
    expect(error).toBeNull();
    expect(await positions(albumId)).toEqual([trackIds[0], trackIds[1], newId]);
    const { data: track } = await admin.from("tracks").select("title, audio_url").eq("id", newId).single();
    expect(track).toEqual({ title: `${tag}-New`, audio_url: `tracks/${tag}-new.mp3` });
    const { data: credits } = await admin
      .from("track_artists").select("artist_id, position").eq("track_id", newId).order("position");
    expect(credits![0]).toEqual({ artist_id: nova, position: 1 });
    expect(credits).toHaveLength(2);
  });

  it("refuses a single, an archived album, and a blank title", async () => {
    tag = newTag("ADD");
    const single = await makeSingle(`${tag}S`); // distinct tag: fixture artist names are `${tag}-A1` and would collide with the album's
    const album = await makeAlbum(tag, 2);
    const client = await signedIn();
    const payload = { title: `${tag}-New`, audioKey: `tracks/${tag}-new.mp3`, artists: [{ newName: `${tag}-X` }] };

    const s = await client.rpc("add_album_track", { p_release_id: single.releaseId, payload });
    expect([s.error?.code, s.error?.message]).toEqual(["22023", "Tracks can only be added to albums."]);

    const blank = await client.rpc("add_album_track", { p_release_id: album.releaseId, payload: { ...payload, title: "   " } });
    expect([blank.error?.code, blank.error?.message]).toEqual(["22023", "Track needs a title."]);

    await archiveRelease(await getViewer(client), album.releaseId);
    const a = await client.rpc("add_album_track", { p_release_id: album.releaseId, payload });
    expect([a.error?.code, a.error?.message]).toEqual(["22023", "This album is archived."]);
  });
});
