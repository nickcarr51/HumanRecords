import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const artistIds: string[] = [];

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

// Deleting an artist goes through removeArtist (src/lib/services/artists.ts);
// a signed-in user's direct delete changes nothing.
describe("artist delete", () => {
  it("leaves a direct table delete with no effect (deletes go through removeArtist)", async () => {
    const a = await seedArtist({ profile_photo_url: "artists/direct.jpg" });
    const del = await labelClient.from("artists").delete().eq("id", a.id).select("id");
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(0);
    const { data } = await admin.from("artists").select("id").eq("id", a.id);
    expect(data).toHaveLength(1);
  });
});
