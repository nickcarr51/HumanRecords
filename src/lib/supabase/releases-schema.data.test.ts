import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const trackIds: string[] = [];
const albumIds: string[] = [];
const artistIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  if (artistIds.length) await admin.from("artists").delete().in("id", artistIds.splice(0));
});

async function makeTrack(title: string) {
  const { data, error } = await admin
    .from("tracks")
    .insert({ title, audio_url: "tracks/x.mp3" })
    .select("id")
    .single();
  if (error) throw error;
  trackIds.push(data.id);
  return data.id as string;
}

describe("releases table", () => {
  it("accepts a single pointing at a track and an album pointing at an album", async () => {
    const trackId = await makeTrack(`REL-${Date.now()}`);
    const { data: album } = await admin.from("albums").insert({ title: "REL album" }).select("id").single();
    albumIds.push(album!.id);

    const single = await admin.from("releases").insert({ kind: "single", track_id: trackId });
    expect(single.error).toBeNull();
    const albumRel = await admin.from("releases").insert({ kind: "album", album_id: album!.id });
    expect(albumRel.error).toBeNull();
  });

  it("rejects a release whose kind doesn't match what it points at", async () => {
    const trackId = await makeTrack(`REL-BAD-${Date.now()}`);
    const { error } = await admin.from("releases").insert({ kind: "album", track_id: trackId });
    expect(error?.code).toBe("23514"); // check_violation
  });

  it("rejects two releases for the same track", async () => {
    const trackId = await makeTrack(`REL-DUP-${Date.now()}`);
    await admin.from("releases").insert({ kind: "single", track_id: trackId });
    const { error } = await admin.from("releases").insert({ kind: "single", track_id: trackId });
    expect(error?.code).toBe("23505"); // unique_violation
  });

  it("deleting the track deletes its release", async () => {
    const trackId = await makeTrack(`REL-CASCADE-${Date.now()}`);
    await admin.from("releases").insert({ kind: "single", track_id: trackId });
    await admin.from("tracks").delete().eq("id", trackId);
    const { data } = await admin.from("releases").select("id").eq("track_id", trackId);
    expect(data).toEqual([]);
  });

  it("is readable by signed-in users", async () => {
    const user = await createTestUser();
    try {
      const client = await user.signIn();
      const { error } = await client.from("releases").select("id").limit(1);
      expect(error).toBeNull();
    } finally {
      await user.cleanup();
    }
  });
});

describe("artist name uniqueness", () => {
  it("rejects a name that differs only by case or surrounding spaces", async () => {
    const name = `Unique-${Date.now()}`;
    const { data } = await admin.from("artists").insert({ name }).select("id").single();
    artistIds.push(data!.id);
    const { error } = await admin.from("artists").insert({ name: `  ${name.toLowerCase()} ` });
    expect(error?.code).toBe("23505");
  });
});

describe("position columns", () => {
  it("are required on link rows", async () => {
    const trackId = await makeTrack(`POS-${Date.now()}`);
    const { data: artist } = await admin.from("artists").insert({ name: `POS-${Date.now()}` }).select("id").single();
    artistIds.push(artist!.id);
    const { error } = await admin
      .from("track_artists")
      .insert({ track_id: trackId, artist_id: artist!.id });
    expect(error?.code).toBe("23502"); // not_null_violation
  });
});

describe("current_user_role()", () => {
  it("returns the caller's own role", async () => {
    const label = await createTestUser({ role: "label_member" });
    const listener = await createTestUser({ role: "listener" });
    try {
      const labelClient = await label.signIn();
      const listenerClient = await listener.signIn();
      expect((await labelClient.rpc("current_user_role")).data).toBe("label_member");
      expect((await listenerClient.rpc("current_user_role")).data).toBe("listener");
    } finally {
      await label.cleanup();
      await listener.cleanup();
    }
  });

  it("is not executable by anonymous callers", async () => {
    const { error } = await createAnonClient().rpc("current_user_role");
    expect(error).not.toBeNull();
  });
});
