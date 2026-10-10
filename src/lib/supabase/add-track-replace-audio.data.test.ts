// src/lib/supabase/add-track-replace-audio.data.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { admin, archivedAt, cleanup, makeAlbum, makeArtist, makeSingle, newTag, positions, queueRows, signedIn } from "./release-admin-fixtures";

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
    await client.rpc("archive_track", { p_track_id: trackIds[1] });
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

    await client.rpc("archive_release", { p_release_id: album.releaseId });
    const a = await client.rpc("add_album_track", { p_release_id: album.releaseId, payload });
    expect([a.error?.code, a.error?.message]).toEqual(["22023", "This album is archived."]);
  });
});

describe("replace_track_audio", () => {
  it("refuses non-label-members", async () => {
    tag = newTag("REP");
    const { trackId } = await makeSingle(tag);
    const client = await signedIn("listener");
    const { error } = await client.rpc("replace_track_audio", { p_track_id: trackId, p_audio_key: `tracks/${tag}-v2.mp3` });
    expect(error?.code).toBe("42501");
  });

  it("swaps audio_url and queues the old key as replaced", async () => {
    tag = newTag("REP");
    const { trackId } = await makeSingle(tag);
    const client = await signedIn();
    expect((await client.rpc("replace_track_audio", { p_track_id: trackId, p_audio_key: `tracks/${tag}-v2.mp3` })).error).toBeNull();
    const { data } = await admin.from("tracks").select("audio_url").eq("id", trackId).single();
    expect(data!.audio_url).toBe(`tracks/${tag}-v2.mp3`);
    expect(await queueRows(tag)).toEqual([
      { object_key: `tracks/${tag}-1.mp3`, reason: "replaced", source_table: "tracks", source_id: trackId, cleaned_at: null },
    ]);
  });

  it("refuses the same key and an archived track", async () => {
    tag = newTag("REP");
    const { releaseId, trackId } = await makeSingle(tag);
    const client = await signedIn();
    const same = await client.rpc("replace_track_audio", { p_track_id: trackId, p_audio_key: `tracks/${tag}-1.mp3` });
    expect([same.error?.code, same.error?.message]).toEqual(["22023", "That file is already on this track."]);

    await client.rpc("archive_release", { p_release_id: releaseId });
    const arch = await client.rpc("replace_track_audio", { p_track_id: trackId, p_audio_key: `tracks/${tag}-v2.mp3` });
    expect([arch.error?.code, arch.error?.message]).toEqual(["22023", "Restore this track before replacing its file."]);
    expect((await archivedAt("tracks", [trackId])).get(trackId)).not.toBeNull();
  });

  it("replace refuses an orphan track (no release)", async () => {
    tag = newTag("RPL");
    const { data: trk, error: insErr } = await admin
      .from("tracks")
      .insert({ title: `${tag}-Orphan`, audio_url: `tracks/${tag}-orphan.mp3` })
      .select("id")
      .single();
    if (insErr) throw insErr;
    const client = await signedIn();
    const { error } = await client.rpc("replace_track_audio", { p_track_id: trk.id, p_audio_key: `tracks/${tag}-v2.mp3` });
    expect(error?.code).toBe("P0002");
    const { data: after } = await admin.from("tracks").select("audio_url").eq("id", trk.id).single();
    expect(after?.audio_url).toBe(`tracks/${tag}-orphan.mp3`);
    expect(await queueRows(tag)).toEqual([]);
  });
});
