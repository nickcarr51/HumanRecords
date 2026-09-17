import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";
import { getArtists, getArtist } from "./artists";

const admin = createAdminClient();
const createdArtistIds: string[] = [];

async function makeArtist(name: string, bio: string | null = null) {
  const { data, error } = await admin
    .from("artists")
    .insert({ name, bio })
    .select("id")
    .single();
  if (error) throw error;
  createdArtistIds.push(data!.id);
  return data!.id as string;
}

afterEach(async () => {
  if (createdArtistIds.length) {
    await admin.from("artists").delete().in("id", createdArtistIds.splice(0));
  }
});

describe("getArtists", () => {
  it("returns a page of artists ordered by name, with total and trackCount", async () => {
    const prefix = `ZZ-${Date.now()}-`;
    await makeArtist(`${prefix}Beta`);
    const alphaId = await makeArtist(`${prefix}Alpha`);
    const track = await admin
      .from("tracks")
      .insert({ title: "T", audio_url: "https://example.com/t.mp3" })
      .select("id")
      .single();
    await admin.from("track_artists").insert({ track_id: track.data!.id, artist_id: alphaId });

    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const result = await getArtists(client, { query: prefix, page: 1, pageSize: 10 });
      expect(result.total).toBe(2);
      expect(result.artists[0].name).toBe(`${prefix}Alpha`);
      expect(result.artists[0].trackCount).toBe(1);
      expect(result.artists[1].trackCount).toBe(0);
    } finally {
      await admin.from("tracks").delete().eq("id", track.data!.id);
      await user.cleanup();
    }
  });

  it("paginates: pageSize limits rows, total counts all matches", async () => {
    const prefix = `PG-${Date.now()}-`;
    for (let i = 0; i < 3; i++) await makeArtist(`${prefix}${i}`);
    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const page1 = await getArtists(client, { query: prefix, page: 1, pageSize: 2 });
      expect(page1.artists).toHaveLength(2);
      expect(page1.total).toBe(3);
      const page2 = await getArtists(client, { query: prefix, page: 2, pageSize: 2 });
      expect(page2.artists).toHaveLength(1);
    } finally {
      await user.cleanup();
    }
  });
});

describe("getArtist", () => {
  it("returns an artist with its tracks, or null when missing", async () => {
    const id = await makeArtist("Detail Artist", "A bio.");
    const track = await admin
      .from("tracks")
      .insert({ title: "Only Track", audio_url: "https://example.com/o.mp3" })
      .select("id")
      .single();
    await admin.from("track_artists").insert({ track_id: track.data!.id, artist_id: id });

    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const detail = await getArtist(client, id);
      expect(detail).not.toBeNull();
      expect(detail!.bio).toBe("A bio.");
      expect(detail!.tracks.map((t) => t.title)).toContain("Only Track");

      const missing = await getArtist(client, "00000000-0000-0000-0000-000000000000");
      expect(missing).toBeNull();
    } finally {
      await admin.from("tracks").delete().eq("id", track.data!.id);
      await user.cleanup();
    }
  });
});
