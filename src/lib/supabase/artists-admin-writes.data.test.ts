import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const artistIds: string[] = [];
const trackIds: string[] = [];
const albumIds: string[] = [];

let label: Awaited<ReturnType<typeof createTestUser>>;
let listener: Awaited<ReturnType<typeof createTestUser>>;
let artistUser: Awaited<ReturnType<typeof createTestUser>>;
let labelClient: SupabaseClient;
let listenerClient: SupabaseClient;
let artistClient: SupabaseClient;

beforeAll(async () => {
  label = await createTestUser({ role: "label_member" });
  listener = await createTestUser({ role: "listener" });
  artistUser = await createTestUser({ role: "artist" });
  labelClient = await label.signIn();
  listenerClient = await listener.signIn();
  artistClient = await artistUser.signIn();
});

afterAll(async () => {
  await label.cleanup();
  await listener.cleanup();
  await artistUser.cleanup();
});

afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (albumIds.length) await admin.from("albums").delete().in("id", albumIds.splice(0));
  if (artistIds.length) {
    const ids = artistIds.splice(0);
    await admin.from("r2_cleanup_queue").delete().in("source_id", ids);
    await admin.from("artists").delete().in("id", ids);
  }
});

const uniqueName = () => `AAW-${randomUUID()}`;

async function seedArtist(extra: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("artists")
    .insert({ name: uniqueName(), ...extra })
    .select("id, name")
    .single();
  if (error) throw error;
  artistIds.push(data.id);
  return data as { id: string; name: string };
}

describe("artists write policies", () => {
  it("lets a label member insert and update an artist", async () => {
    const { data, error } = await labelClient
      .from("artists")
      .insert({ name: uniqueName(), bio: "hi" })
      .select("id")
      .single();
    expect(error).toBeNull();
    artistIds.push(data!.id);

    const upd = await labelClient.from("artists").update({ bio: "changed" }).eq("id", data!.id).select("id");
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(1);
  });

  it("rejects inserts and updates from a listener", async () => {
    const ins = await listenerClient.from("artists").insert({ name: uniqueName() });
    expect(ins.error?.code).toBe("42501");

    const a = await seedArtist();
    const upd = await listenerClient.from("artists").update({ bio: "nope" }).eq("id", a.id).select("id");
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(0);
  });

  it("rejects inserts and updates from the artist role", async () => {
    const ins = await artistClient.from("artists").insert({ name: uniqueName() });
    expect(ins.error?.code).toBe("42501");

    const a = await seedArtist();
    const upd = await artistClient.from("artists").update({ bio: "nope" }).eq("id", a.id).select("id");
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(0);
  });

  it("rejects blank or whitespace-only names on insert and update", async () => {
    for (const name of ["", "   "]) {
      const ins = await labelClient.from("artists").insert({ name });
      expect(ins.error?.code).toBe("42501");
    }
    const a = await seedArtist();
    const upd = await labelClient.from("artists").update({ name: "  " }).eq("id", a.id);
    expect(upd.error?.code).toBe("42501");
    const { data } = await admin.from("artists").select("name").eq("id", a.id).single();
    expect(data!.name).toBe(a.name);
  });

  it("rejects a duplicate name (case/space-insensitive) on insert and update", async () => {
    const a = await seedArtist();
    const b = await seedArtist();
    const ins = await labelClient.from("artists").insert({ name: `  ${a.name.toLowerCase()} ` });
    expect(ins.error?.code).toBe("23505");
    const upd = await labelClient.from("artists").update({ name: a.name.toUpperCase() }).eq("id", b.id);
    expect(upd.error?.code).toBe("23505");
  });

  it("allows re-casing an artist's own name", async () => {
    const a = await seedArtist();
    const upd = await labelClient.from("artists").update({ name: ` ${a.name.toLowerCase()} ` }).eq("id", a.id).select("id");
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(1);
  });

  it("rejects linking one user to two artists on insert and update", async () => {
    await seedArtist({ user_id: listener.id });
    const b = await seedArtist();
    const ins = await labelClient.from("artists").insert({ name: uniqueName(), user_id: listener.id });
    expect(ins.error?.code).toBe("23505");
    expect(ins.error?.message).toMatch(/artists_user_id_key/);
    const upd = await labelClient.from("artists").update({ user_id: listener.id }).eq("id", b.id);
    expect(upd.error?.code).toBe("23505");
  });
});

describe("admin_delete_artist", () => {
  it("refuses non-label-members", async () => {
    const a = await seedArtist();
    const { error } = await listenerClient.rpc("admin_delete_artist", { target: a.id });
    expect(error?.code).toBe("42501");
  });

  it("refuses the artist role", async () => {
    const a = await seedArtist();
    const { error } = await artistClient.rpc("admin_delete_artist", { target: a.id });
    expect(error?.code).toBe("42501");
  });

  it("leaves a direct table delete with no effect (deletes must go through the function)", async () => {
    const a = await seedArtist({ profile_photo_url: "artists/direct.jpg" });
    const del = await labelClient.from("artists").delete().eq("id", a.id).select("id");
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(0);
    const { data } = await admin.from("artists").select("id").eq("id", a.id);
    expect(data).toHaveLength(1);
  });

  it("raises P0002 for an unknown artist", async () => {
    const { error } = await labelClient.rpc("admin_delete_artist", { target: randomUUID() });
    expect(error?.code).toBe("P0002");
  });

  it("fails with 23503 and keeps the row while credited on a track", async () => {
    const a = await seedArtist();
    const { data: t } = await admin.from("tracks").insert({ title: "AAW track", audio_url: "tracks/x.mp3" }).select("id").single();
    trackIds.push(t!.id);
    await admin.from("track_artists").insert({ track_id: t!.id, artist_id: a.id, position: 1 });
    const { error } = await labelClient.rpc("admin_delete_artist", { target: a.id });
    expect(error?.code).toBe("23503");
    const { data } = await admin.from("artists").select("id").eq("id", a.id);
    expect(data).toHaveLength(1);
  });

  it("fails with 23503 and keeps the row while credited on an album", async () => {
    const a = await seedArtist();
    const { data: al } = await admin.from("albums").insert({ title: "AAW album" }).select("id").single();
    albumIds.push(al!.id);
    await admin.from("album_artists").insert({ album_id: al!.id, artist_id: a.id, position: 1 });
    const { error } = await labelClient.rpc("admin_delete_artist", { target: a.id });
    expect(error?.code).toBe("23503");
    const { data } = await admin.from("artists").select("id").eq("id", a.id);
    expect(data).toHaveLength(1);
  });

  it("deletes an uncredited artist and queues their photo key", async () => {
    const a = await seedArtist({ profile_photo_url: "artists/aaw.jpg" });
    const { error } = await labelClient.rpc("admin_delete_artist", { target: a.id });
    expect(error).toBeNull();
    const { data: gone } = await admin.from("artists").select("id").eq("id", a.id);
    expect(gone).toHaveLength(0);
    const { data: queued } = await admin
      .from("r2_cleanup_queue")
      .select("object_key, reason, source_table")
      .eq("source_id", a.id);
    expect(queued).toEqual([{ object_key: "artists/aaw.jpg", reason: "archived", source_table: "artists" }]);
  });

  it("deletes an uncredited artist without a photo and queues nothing", async () => {
    const a = await seedArtist();
    const { error } = await labelClient.rpc("admin_delete_artist", { target: a.id });
    expect(error).toBeNull();
    const { data: queued } = await admin.from("r2_cleanup_queue").select("id").eq("source_id", a.id);
    expect(queued).toHaveLength(0);
  });
});
