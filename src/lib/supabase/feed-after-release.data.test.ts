import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "./test-helpers";
import { getFeed, getFeedAfterRelease, getReleaseFeedPage, type ReleaseRef } from "./feed";

const admin = createAdminClient();
const trackIds: string[] = [];
const albumIds: string[] = [];

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
});

async function album(title: string, sortAt: string): Promise<string> {
  const { data, error } = await admin.from("albums").insert({ title }).select("id").single();
  if (error) throw error;
  albumIds.push(data.id);
  const t = await admin.from("tracks").insert({ title: `${title} t1`, audio_url: "tracks/x.mp3" }).select("id").single();
  if (t.error) throw t.error;
  trackIds.push(t.data.id);
  const ta = await admin.from("track_albums").insert({ album_id: data.id, track_id: t.data.id, position: 1 });
  if (ta.error) throw ta.error;
  const rel = await admin.from("releases").insert({ kind: "album", album_id: data.id, sort_at: sortAt });
  if (rel.error) throw rel.error;
  return data.id as string;
}

async function single(title: string, sortAt: string): Promise<string> {
  const t = await admin.from("tracks").insert({ title, audio_url: "tracks/x.mp3" }).select("id").single();
  if (t.error) throw t.error;
  trackIds.push(t.data.id);
  const rel = await admin.from("releases").insert({ kind: "single", track_id: t.data.id, sort_at: sortAt });
  if (rel.error) throw rel.error;
  return t.data.id as string;
}

const albumRef = (albumId: string): ReleaseRef => ({ kind: "album", albumId });
const singleRef = (trackId: string): ReleaseRef => ({ kind: "single", trackId });

async function withListener<T>(fn: (client: Awaited<ReturnType<Awaited<ReturnType<typeof createTestUser>>["signIn"]>>) => Promise<T>) {
  const user = await createTestUser({ role: "listener" });
  try {
    return await fn(await user.signIn());
  } finally {
    await user.cleanup();
  }
}

describe("getReleaseFeedPage / getFeedAfterRelease (albums)", () => {
  it("finds the page each album is on, for several page sizes", async () => {
    const tag = `FAA${Date.now()}`;
    const ids = [
      await album(`${tag} A`, "2102-01-03T00:00:00Z"),
      await album(`${tag} B`, "2102-01-02T00:00:00Z"),
      await album(`${tag} C`, "2102-01-01T00:00:00Z"),
    ];
    await withListener(async (client) => {
      for (const pageSize of [1, 2, 3]) {
        for (const id of ids) {
          const page = await getReleaseFeedPage(client, albumRef(id), pageSize);
          expect(page).not.toBeNull();
          const { items } = await getFeed(client, { page: page!, pageSize });
          expect(items.some((i) => i.kind === "album" && i.id === id)).toBe(true);
        }
      }
    });
  });

  it("returns the releases after the album, crossing a page edge when the album ends its page", async () => {
    const tag = `FAB${Date.now()}`;
    const ids = [
      await album(`${tag} A`, "2102-02-03T00:00:00Z"),
      await album(`${tag} B`, "2102-02-02T00:00:00Z"),
      await album(`${tag} C`, "2102-02-01T00:00:00Z"),
    ];
    await withListener(async (client) => {
      const order = (await getFeed(client, { pageSize: 500 })).items.map((i) => i.id);
      // pageSize 1: every album is the last item on its page, so this always crosses an edge.
      for (const pageSize of [1, 2]) {
        for (const id of ids) {
          const after = await getFeedAfterRelease(client, albumRef(id), pageSize);
          expect(after).not.toBeNull();
          const expectedNext = order[order.indexOf(id) + 1];
          expect(after!.items[0]?.id).toBe(expectedNext);
          const { items } = await getFeed(client, { page: after!.page, pageSize });
          expect(items.map((i) => i.id)).toContain(expectedNext);
        }
      }
    });
  });

  it("returns null for an archived album", async () => {
    const id = await album(`FAC${Date.now()}`, "2102-03-01T00:00:00Z");
    const upd = await admin.from("releases").update({ archived_at: new Date().toISOString() }).eq("album_id", id);
    if (upd.error) throw upd.error;
    await withListener(async (client) => {
      expect(await getReleaseFeedPage(client, albumRef(id), 2)).toBeNull();
      expect(await getFeedAfterRelease(client, albumRef(id), 2)).toBeNull();
    });
  });
});

describe("getReleaseFeedPage / getFeedAfterRelease (singles)", () => {
  it("finds the page each single is on, for several page sizes", async () => {
    const tag = `FRS${Date.now()}`;
    const ids = [
      await single(`${tag} A`, "2102-04-03T00:00:00Z"),
      await single(`${tag} B`, "2102-04-02T00:00:00Z"),
      await single(`${tag} C`, "2102-04-01T00:00:00Z"),
    ];
    await withListener(async (client) => {
      for (const pageSize of [1, 2, 3]) {
        for (const id of ids) {
          const page = await getReleaseFeedPage(client, singleRef(id), pageSize);
          expect(page).not.toBeNull();
          const { items } = await getFeed(client, { page: page!, pageSize });
          expect(items.some((i) => i.kind === "track" && i.id === id)).toBe(true);
        }
      }
    });
  });

  it("returns the next page's items when the single ends its page", async () => {
    const tag = `FRT${Date.now()}`;
    const ids = [
      await single(`${tag} A`, "2102-05-03T00:00:00Z"),
      await album(`${tag} B`, "2102-05-02T00:00:00Z"),
      await single(`${tag} C`, "2102-05-01T00:00:00Z"),
    ];
    await withListener(async (client) => {
      const order = (await getFeed(client, { pageSize: 500 })).items.map((i) => i.id);
      for (const id of [ids[0], ids[2]]) {
        const page = await getReleaseFeedPage(client, singleRef(id), 1);
        const after = await getFeedAfterRelease(client, singleRef(id), 1);
        expect(after).not.toBeNull();
        expect(after!.page).toBe(page! + 1);
        const next = await getFeed(client, { page: page! + 1, pageSize: 1 });
        expect(after!.items.map((i) => i.id)).toEqual(next.items.map((i) => i.id));
        expect(after!.items[0]?.id).toBe(order[order.indexOf(id) + 1]);
      }
    });
  });

  it("returns null for an archived single", async () => {
    const id = await single(`FRU${Date.now()}`, "2102-06-01T00:00:00Z");
    const upd = await admin.from("releases").update({ archived_at: new Date().toISOString() }).eq("track_id", id);
    if (upd.error) throw upd.error;
    await withListener(async (client) => {
      expect(await getReleaseFeedPage(client, singleRef(id), 2)).toBeNull();
      expect(await getFeedAfterRelease(client, singleRef(id), 2)).toBeNull();
    });
  });
});
