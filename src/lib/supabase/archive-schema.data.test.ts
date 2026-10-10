import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const trackIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
});

async function makeSingle(title: string, extra: Record<string, unknown> = {}) {
  const { data: t, error } = await admin
    .from("tracks")
    .insert({ title, audio_url: "tracks/x.mp3" })
    .select("id")
    .single();
  if (error) throw error;
  trackIds.push(t.id);
  const { data: r, error: rErr } = await admin
    .from("releases")
    .insert({ kind: "single", track_id: t.id, ...extra })
    .select("id, pinned, sort_at, created_at, archived_at")
    .single();
  if (rErr) throw rErr;
  return { trackId: t.id as string, release: r };
}

describe("releases ordering columns", () => {
  it("defaults pinned to false and sort_at to created_at", async () => {
    const { release } = await makeSingle(`ARC-${Date.now()}`, { created_at: "2001-02-03T04:05:06Z" });
    expect(release.pinned).toBe(false);
    expect(new Date(release.sort_at).toISOString()).toBe("2001-02-03T04:05:06.000Z");
    expect(release.archived_at).toBeNull();
  });

  it("never lets created_at change after insert (releases, tracks, albums)", async () => {
    const { trackId, release } = await makeSingle(`ARC-LOCK-${Date.now()}`, { created_at: "2001-02-03T04:05:06Z" });
    await admin.from("releases").update({ created_at: "2030-01-01T00:00:00Z", sort_at: "2030-01-01T00:00:00Z" }).eq("id", release.id);
    const { data: r } = await admin.from("releases").select("created_at, sort_at").eq("id", release.id).single();
    expect(new Date(r!.created_at).toISOString()).toBe("2001-02-03T04:05:06.000Z");
    expect(new Date(r!.sort_at).toISOString()).toBe("2030-01-01T00:00:00.000Z"); // sort_at stays movable

    const { data: t0 } = await admin.from("tracks").select("created_at").eq("id", trackId).single();
    await admin.from("tracks").update({ created_at: "2030-01-01T00:00:00Z" }).eq("id", trackId);
    const { data: t1 } = await admin.from("tracks").select("created_at").eq("id", trackId).single();
    expect(t1!.created_at).toBe(t0!.created_at);

    const { data: al } = await admin.from("albums").insert({ title: "ARC-LOCK album" }).select("id, created_at").single();
    try {
      await admin.from("albums").update({ created_at: "2030-01-01T00:00:00Z" }).eq("id", al!.id);
      const { data: a1 } = await admin.from("albums").select("created_at").eq("id", al!.id).single();
      expect(a1!.created_at).toBe(al!.created_at);
    } finally {
      await admin.from("albums").delete().eq("id", al!.id);
    }
  });

  it("keeps an explicit sort_at", async () => {
    const { release } = await makeSingle(`ARC-${Date.now()}`, { sort_at: "2050-01-01T00:00:00Z" });
    expect(new Date(release.sort_at).toISOString()).toBe("2050-01-01T00:00:00.000Z");
  });
});

describe("archived rows", () => {
  it("are hidden from listeners and visible to label members", async () => {
    const { trackId, release } = await makeSingle(`ARC-HIDE-${Date.now()}`);
    const now = new Date().toISOString();
    await admin.from("releases").update({ archived_at: now }).eq("id", release.id);
    await admin.from("tracks").update({ archived_at: now }).eq("id", trackId);

    const listener = await createTestUser({ role: "listener" });
    const label = await createTestUser({ role: "label_member" });
    try {
      const lc = await listener.signIn();
      expect((await lc.from("releases").select("id").eq("id", release.id)).data).toEqual([]);
      expect((await lc.from("tracks").select("id").eq("id", trackId)).data).toEqual([]);

      const mc = await label.signIn();
      expect((await mc.from("releases").select("id").eq("id", release.id)).data).toHaveLength(1);
      expect((await mc.from("tracks").select("id").eq("id", trackId)).data).toHaveLength(1);
    } finally {
      await listener.cleanup();
      await label.cleanup();
    }
  });

  it("live rows stay visible to listeners", async () => {
    const { trackId, release } = await makeSingle(`ARC-LIVE-${Date.now()}`);
    const listener = await createTestUser({ role: "listener" });
    try {
      const lc = await listener.signIn();
      expect((await lc.from("releases").select("id").eq("id", release.id)).data).toHaveLength(1);
      expect((await lc.from("tracks").select("id").eq("id", trackId)).data).toHaveLength(1);
    } finally {
      await listener.cleanup();
    }
  });
});
