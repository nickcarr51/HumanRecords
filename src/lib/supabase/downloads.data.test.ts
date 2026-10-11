import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";
import { getMyDownloadedTrackIds } from "./downloads";

const admin = createAdminClient();
const trackIds: string[] = [];
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  // downloads rows cascade from both users and tracks
  for (const c of cleanups.splice(0)) await c();
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
});

async function makeTrack(title: string) {
  const { data, error } = await admin.from("tracks").insert({ title, audio_url: "tracks/x.mp3" }).select("id").single();
  if (error) throw error;
  trackIds.push(data.id);
  return data.id as string;
}

async function makeUser() {
  const u = await createTestUser();
  cleanups.push(u.cleanup);
  return u;
}

describe("getMyDownloadedTrackIds (RLS)", () => {
  it("returns only the caller's own downloads", async () => {
    const [me, other] = [await makeUser(), await makeUser()];
    const [t1, t2, t3] = [await makeTrack("DL-1"), await makeTrack("DL-2"), await makeTrack("DL-3")];
    await admin.from("downloads").insert([
      { user_id: me.id, track_id: t1 },
      { user_id: other.id, track_id: t2 },
    ]);
    const client = await me.signIn();
    expect(await getMyDownloadedTrackIds(client, [t1, t2, t3])).toEqual([t1]);
  });
});

describe("download recording", () => {
  it("a repeat download (ignoreDuplicates upsert, as getTrackDownloadUrl does) keeps exactly one row", async () => {
    const me = await makeUser();
    const t = await makeTrack("DL-REPEAT");
    for (let i = 0; i < 2; i++) {
      const { error } = await admin
        .from("downloads")
        .upsert({ user_id: me.id, track_id: t }, { onConflict: "user_id,track_id", ignoreDuplicates: true });
      expect(error).toBeNull();
    }
    const { count } = await admin
      .from("downloads")
      .select("*", { count: "exact", head: true })
      .eq("user_id", me.id)
      .eq("track_id", t);
    expect(count).toBe(1);
  });
});
