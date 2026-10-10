import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const trackIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
});

async function makeRelease(sortAt: string, pinned = false) {
  const { data: t, error } = await admin
    .from("tracks")
    .insert({ title: `MOVE-${Date.now()}-${Math.random()}`, audio_url: "tracks/x.mp3" })
    .select("id")
    .single();
  if (error) throw error;
  trackIds.push(t.id);
  const { data: r, error: rErr } = await admin
    .from("releases")
    .insert({ kind: "single", track_id: t.id, sort_at: sortAt, pinned })
    .select("id")
    .single();
  if (rErr) throw rErr;
  return r.id as string;
}

async function order(ids: string[]) {
  const { data } = await admin
    .from("releases")
    .select("id")
    .in("id", ids)
    .order("pinned", { ascending: false })
    .order("sort_at", { ascending: false })
    .order("id", { ascending: false });
  return (data ?? []).map((r) => r.id);
}

async function asLabel<T>(fn: (c: SupabaseClient) => Promise<T>) {
  const user = await createTestUser({ role: "label_member" });
  try {
    return await fn(await user.signIn());
  } finally {
    await user.cleanup();
  }
}

describe("move_release", () => {
  it("moves a release up and down one place", async () => {
    const a = await makeRelease("2203-01-01T00:00:00Z");
    const b = await makeRelease("2202-01-01T00:00:00Z");
    const c = await makeRelease("2201-01-01T00:00:00Z");
    await asLabel(async (client) => {
      expect((await client.rpc("move_release", { target: c, direction: "up" })).error).toBeNull();
      expect(await order([a, b, c])).toEqual([a, c, b]);
      expect((await client.rpc("move_release", { target: a, direction: "down" })).error).toBeNull();
      expect(await order([a, b, c])).toEqual([c, a, b]);
    });
  });

  it("is a no-op at the top of the unpinned group, even with pinned releases above", async () => {
    const pinned = await makeRelease("2000-01-01T00:00:00Z", true);
    const top = await makeRelease("2300-01-01T00:00:00Z");
    await asLabel(async (client) => {
      expect((await client.rpc("move_release", { target: top, direction: "up" })).error).toBeNull();
    });
    const { data } = await admin.from("releases").select("id, sort_at, pinned").in("id", [pinned, top]);
    const topRow = data!.find((r) => r.id === top)!;
    expect(new Date(topRow.sort_at).toISOString()).toBe("2300-01-01T00:00:00.000Z");
    expect(topRow.pinned).toBe(false);
  });

  it("still moves when the neighbour has an identical sort_at", async () => {
    const a = await makeRelease("2400-01-01T00:00:00Z");
    const b = await makeRelease("2400-01-01T00:00:00Z");
    const [first, second] = await order([a, b]);
    await asLabel(async (client) => {
      expect((await client.rpc("move_release", { target: second, direction: "up" })).error).toBeNull();
    });
    expect(await order([a, b])).toEqual([second, first]);
  });

  it("rejects non-label members", async () => {
    const a = await makeRelease("2500-01-01T00:00:00Z");
    const user = await createTestUser({ role: "listener" });
    try {
      const client = await user.signIn();
      const { error } = await client.rpc("move_release", { target: a, direction: "up" });
      expect(error?.code).toBe("42501");
    } finally {
      await user.cleanup();
    }
  });

  it("rejects a bad direction", async () => {
    const a = await makeRelease("2600-01-01T00:00:00Z");
    await asLabel(async (client) => {
      const { error } = await client.rpc("move_release", { target: a, direction: "sideways" });
      expect(error?.code).toBe("22023");
    });
  });
});
