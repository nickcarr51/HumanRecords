import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const trackIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
});

async function makeRelease(sortAt: string, pinned = false, id?: string) {
  const { data: t, error } = await admin
    .from("tracks")
    .insert({ title: `MOVE-${Date.now()}-${Math.random()}`, audio_url: "tracks/x.mp3" })
    .select("id")
    .single();
  if (error) throw error;
  trackIds.push(t.id);
  const { data: r, error: rErr } = await admin
    .from("releases")
    .insert({ kind: "single", track_id: t.id, sort_at: sortAt, pinned, ...(id ? { id } : {}) })
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

async function sortAts(ids: string[]) {
  const { data } = await admin.from("releases").select("id, sort_at").in("id", ids);
  return new Map((data ?? []).map((r) => [r.id, r.sort_at as string]));
}

function expectDistinct(m: Map<string, string>) {
  const ms = [...m.values()].map((v) => new Date(v).getTime());
  expect(new Set(ms).size).toBe(ms.length);
}

const ID_C = "ffffffff-0000-4000-8000-000000000001";
const ID_A = "eeeeeeee-0000-4000-8000-000000000001";
const ID_B = "11111111-0000-4000-8000-000000000001";

async function tiedPairPlusOlder(year: number) {
  // Feed order reads A, B, C: A and B tie at t (A wins on id), C is a day older.
  await admin.from("releases").delete().in("id", [ID_A, ID_B, ID_C]);
  await makeRelease(`${year}-01-02T00:00:00Z`, false, ID_A);
  await makeRelease(`${year}-01-02T00:00:00Z`, false, ID_B);
  await makeRelease(`${year}-01-01T00:00:00Z`, false, ID_C);
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

  it("moves exactly one spot when three releases share a sort_at", async () => {
    const a = await makeRelease("2700-01-01T00:00:00Z");
    const b = await makeRelease("2700-01-01T00:00:00Z");
    const c = await makeRelease("2700-01-01T00:00:00Z");
    const [top, mid, bottom] = await order([a, b, c]);
    await asLabel(async (client) => {
      expect((await client.rpc("move_release", { target: bottom, direction: "up" })).error).toBeNull();
      expect(await order([a, b, c])).toEqual([top, bottom, mid]);
      expect((await client.rpc("move_release", { target: top, direction: "down" })).error).toBeNull();
      expect(await order([a, b, c])).toEqual([bottom, top, mid]);
    });
  });

  it("moves exactly one spot down when a third row is tied with the current one", async () => {
    await tiedPairPlusOlder(2800);
    expect(await order([ID_A, ID_B, ID_C])).toEqual([ID_A, ID_B, ID_C]);
    await asLabel(async (client) => {
      expect((await client.rpc("move_release", { target: ID_B, direction: "down" })).error).toBeNull();
    });
    expect(await order([ID_A, ID_B, ID_C])).toEqual([ID_A, ID_C, ID_B]);
    expectDistinct(await sortAts([ID_A, ID_B, ID_C]));
  });

  it("moves exactly one spot up when a third row is tied with the neighbour", async () => {
    await tiedPairPlusOlder(2801);
    await asLabel(async (client) => {
      expect((await client.rpc("move_release", { target: ID_C, direction: "up" })).error).toBeNull();
    });
    expect(await order([ID_A, ID_B, ID_C])).toEqual([ID_A, ID_C, ID_B]);
    expectDistinct(await sortAts([ID_A, ID_B, ID_C]));
  });

  it("spreads ties in 1 millisecond steps", async () => {
    const a = await makeRelease("2802-01-01T00:00:00Z");
    const b = await makeRelease("2802-01-01T00:00:00Z");
    const c = await makeRelease("2802-01-01T00:00:00Z");
    const [top] = await order([a, b, c]);
    await asLabel(async (client) => {
      expect((await client.rpc("move_release", { target: top, direction: "down" })).error).toBeNull();
    });
    const ms = [...(await sortAts([a, b, c])).values()].map((v) => new Date(v).getTime()).sort((x, y) => y - x);
    expect(ms[0] - ms[1]).toBe(1);
    expect(ms[1] - ms[2]).toBe(1);
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
