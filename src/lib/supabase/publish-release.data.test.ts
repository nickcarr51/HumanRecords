import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
let tag = "";
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  // Tracks/albums created by the function carry the tag in their titles;
  // artists created by it carry the tag in their names. Deleting tracks and
  // albums cascades to releases and link rows.
  await admin.from("tracks").delete().like("title", `${tag}%`);
  await admin.from("albums").delete().like("title", `${tag}%`);
  await admin.from("artists").delete().ilike("name", `${tag}%`);
  for (const c of cleanups.splice(0)) await c();
});

async function labelClient(): Promise<SupabaseClient> {
  const user = await createTestUser({ role: "label_member" });
  cleanups.push(user.cleanup);
  return user.signIn();
}

function newTag() {
  tag = `PUB${Date.now()}x`;
  return tag;
}

describe("publish_release", () => {
  it("publishes a single with ordered artists, creating new ones", async () => {
    const t = newTag();
    const { data: existing } = await admin.from("artists").insert({ name: `${t}Existing` }).select("id").single();
    const client = await labelClient();

    const { data: releaseId, error } = await client.rpc("publish_release", {
      payload: {
        kind: "single",
        tracks: [
          {
            title: `${t}Song`,
            audioKey: "tracks/00000000-0000-0000-0000-000000000001.mp3",
            artists: [{ newName: `${t}Brand New` }, { id: existing!.id }],
          },
        ],
      },
    });
    expect(error).toBeNull();

    const { data: rel } = await admin
      .from("releases")
      .select("kind, album_id, track:tracks ( title, audio_url, track_artists ( position, artists ( name ) ) )")
      .eq("id", releaseId as string)
      .single();
    expect(rel!.kind).toBe("single");
    expect(rel!.album_id).toBeNull();
    const track = rel!.track as unknown as {
      title: string;
      audio_url: string;
      track_artists: Array<{ position: number; artists: { name: string } }>;
    };
    expect(track.title).toBe(`${t}Song`);
    expect(track.audio_url).toBe("tracks/00000000-0000-0000-0000-000000000001.mp3");
    const credits = [...track.track_artists].sort((a, b) => a.position - b.position).map((c) => c.artists.name);
    expect(credits).toEqual([`${t}Brand New`, `${t}Existing`]);
  });

  it("publishes an album with track order and album artists", async () => {
    const t = newTag();
    const client = await labelClient();
    const { data: releaseId, error } = await client.rpc("publish_release", {
      payload: {
        kind: "album",
        album: { title: `${t}Album`, artists: [{ newName: `${t}Lead` }] },
        tracks: [
          { title: `${t}B-first`, audioKey: "tracks/b.mp3", artists: [{ newName: `${t}Lead` }] },
          { title: `${t}A-second`, audioKey: "tracks/a.mp3", artists: [{ newName: `${t}Feat` }] },
        ],
      },
    });
    expect(error).toBeNull();

    const { data: rel } = await admin
      .from("releases")
      .select("kind, album:albums ( title, album_artists ( position, artists ( name ) ), track_albums ( position, tracks ( title ) ) )")
      .eq("id", releaseId as string)
      .single();
    expect(rel!.kind).toBe("album");
    const album = rel!.album as unknown as {
      title: string;
      album_artists: Array<{ position: number; artists: { name: string } }>;
      track_albums: Array<{ position: number; tracks: { title: string } }>;
    };
    expect(album.title).toBe(`${t}Album`);
    expect(album.album_artists.map((a) => a.artists.name)).toEqual([`${t}Lead`]);
    const order = [...album.track_albums].sort((a, b) => a.position - b.position).map((r) => r.tracks.title);
    expect(order).toEqual([`${t}B-first`, `${t}A-second`]);
  });

  it("reuses an existing artist when a 'new' name differs only by case/spaces, and creates one row for a repeated new name", async () => {
    const t = newTag();
    await admin.from("artists").insert({ name: `${t}Daye` });
    const client = await labelClient();
    const { error } = await client.rpc("publish_release", {
      payload: {
        kind: "album",
        album: { title: `${t}Album`, artists: [] },
        tracks: [
          { title: `${t}One`, audioKey: "tracks/1.mp3", artists: [{ newName: `  ${t}daye ` }, { newName: `${t}Sawcy` }] },
          { title: `${t}Two`, audioKey: "tracks/2.mp3", artists: [{ newName: ` ${t}SAWCY` }] },
        ],
      },
    });
    expect(error).toBeNull();
    const { data: artists } = await admin.from("artists").select("name").ilike("name", `${t}%`);
    expect(artists!.map((a) => a.name).sort()).toEqual([`${t}Daye`, `${t}Sawcy`].sort());
  });

  it("allows an album with no album artists", async () => {
    const t = newTag();
    const client = await labelClient();
    const { error } = await client.rpc("publish_release", {
      payload: {
        kind: "album",
        album: { title: `${t}Comp`, artists: [] },
        tracks: [
          { title: `${t}One`, audioKey: "tracks/1.mp3", artists: [{ newName: `${t}X` }] },
          { title: `${t}Two`, audioKey: "tracks/2.mp3", artists: [{ newName: `${t}Y` }] },
        ],
      },
    });
    expect(error).toBeNull();
  });

  it("refuses listeners and artists with 42501 and writes nothing", async () => {
    const t = newTag();
    for (const role of ["listener", "artist"] as const) {
      const user = await createTestUser({ role });
      cleanups.push(user.cleanup);
      const client = await user.signIn();
      const { error } = await client.rpc("publish_release", {
        payload: { kind: "single", tracks: [{ title: `${t}Nope`, audioKey: "tracks/n.mp3", artists: [{ newName: `${t}Nope` }] }] },
      });
      expect(error?.code).toBe("42501");
    }
    const { data } = await admin.from("tracks").select("id").like("title", `${t}%`);
    expect(data).toEqual([]);
  });

  it("rolls back everything when a later track is invalid", async () => {
    const t = newTag();
    const client = await labelClient();
    const { error } = await client.rpc("publish_release", {
      payload: {
        kind: "album",
        album: { title: `${t}Broken`, artists: [] },
        tracks: [
          { title: `${t}Good`, audioKey: "tracks/g.mp3", artists: [{ newName: `${t}WouldBeCreated` }] },
          { title: `${t}Bad`, audioKey: "tracks/b.mp3", artists: [] },
        ],
      },
    });
    expect(error?.code).toBe("22023");
    expect((await admin.from("tracks").select("id").like("title", `${t}%`)).data).toEqual([]);
    expect((await admin.from("albums").select("id").like("title", `${t}%`)).data).toEqual([]);
    expect((await admin.from("artists").select("id").ilike("name", `${t}%`)).data).toEqual([]);
  });

  it.each([
    ["single with two tracks", { kind: "single", tracks: [{ title: "a", audioKey: "k", artists: [{ newName: "x" }] }, { title: "b", audioKey: "k", artists: [{ newName: "x" }] }] }],
    ["album with one track", { kind: "album", album: { title: "A", artists: [] }, tracks: [{ title: "a", audioKey: "k", artists: [{ newName: "x" }] }] }],
    ["album without title", { kind: "album", album: { title: " ", artists: [] }, tracks: [{ title: "a", audioKey: "k", artists: [{ newName: "x" }] }, { title: "b", audioKey: "k", artists: [{ newName: "x" }] }] }],
    ["track without title", { kind: "single", tracks: [{ title: "", audioKey: "k", artists: [{ newName: "x" }] }] }],
    ["track without audioKey", { kind: "single", tracks: [{ title: "a", audioKey: "", artists: [{ newName: "x" }] }] }],
    ["unknown artist id", { kind: "single", tracks: [{ title: "a", audioKey: "k", artists: [{ id: "00000000-0000-0000-0000-000000000000" }] }] }],
    ["single with album block", { kind: "single", album: { title: "A", artists: [] }, tracks: [{ title: "a", audioKey: "k", artists: [{ newName: "x" }] }] }],
  ])("rejects %s with 22023", async (_label, payload) => {
    newTag();
    const client = await labelClient();
    const { error } = await client.rpc("publish_release", { payload });
    expect(error?.code).toBe("22023");
  });
});
