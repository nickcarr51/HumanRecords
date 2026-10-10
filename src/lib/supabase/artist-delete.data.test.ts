import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "./test-helpers";

const admin = createAdminClient();
const trackIds: string[] = [];
const albumIds: string[] = [];
const artistIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  if (artistIds.length) await admin.from("artists").delete().in("id", artistIds.splice(0));
});

async function artist() {
  const { data, error } = await admin.from("artists").insert({ name: `DEL-${Date.now()}-${Math.random()}` }).select("id").single();
  if (error) throw error;
  artistIds.push(data.id);
  return data.id as string;
}

describe("deleting an artist", () => {
  it("fails while they are credited on a track", async () => {
    const a = await artist();
    const { data: t } = await admin.from("tracks").insert({ title: "DEL track", audio_url: "tracks/x.mp3" }).select("id").single();
    trackIds.push(t!.id);
    await admin.from("track_artists").insert({ track_id: t!.id, artist_id: a, position: 1 });
    const { error } = await admin.from("artists").delete().eq("id", a);
    expect(error?.code).toBe("23503");
  });

  it("fails while they are credited on an album", async () => {
    const a = await artist();
    const { data: al } = await admin.from("albums").insert({ title: "DEL album" }).select("id").single();
    albumIds.push(al!.id);
    await admin.from("album_artists").insert({ album_id: al!.id, artist_id: a, position: 1 });
    const { error } = await admin.from("artists").delete().eq("id", a);
    expect(error?.code).toBe("23503");
  });

  it("succeeds for an uncredited artist", async () => {
    const a = await artist();
    const { error } = await admin.from("artists").delete().eq("id", a);
    expect(error).toBeNull();
  });
});
