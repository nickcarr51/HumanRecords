// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { getAdminArtist, loadLinkTargets } from "./artists";

// getAdminArtist and loadLinkTargets read the user list through getViewer,
// asUser, listUsers and asSystem. These run that whole path against the local
// database, with nothing mocked.
const admin = createAdminClient();
let label: Awaited<ReturnType<typeof createTestUser>>;
let linked: Awaited<ReturnType<typeof createTestUser>>;
let db: SupabaseClient<Database>;
let artistId: string | undefined;
const NAME = `LNK-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  label = await createTestUser({ role: "label_member" });
  linked = await createTestUser({ role: "artist", name: `${NAME} Person` });
  db = (await label.signIn()) as unknown as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("artists")
    .insert({ name: `${NAME} Artist`, user_id: linked.id })
    .select("id")
    .single();
  if (error) throw error;
  artistId = data.id;
});

// Guarded: when setup failed part-way, clean up only what was created. The
// artist goes first because it points at the linked user.
afterAll(async () => {
  try {
    if (artistId) {
      const { error } = await admin.from("artists").delete().eq("id", artistId);
      if (error) throw error;
    }
  } finally {
    if (linked) await linked.cleanup();
    if (label) await label.cleanup();
  }
});

describe("admin artist links (real users)", () => {
  it("getAdminArtist returns the user the artist is linked to", async () => {
    const detail = await getAdminArtist(db, artistId!);
    expect(detail?.linkedUser).toEqual({ id: linked.id, name: `${NAME} Person`, email: linked.email });
  });

  it("loadLinkTargets returns real users and the artist's link", async () => {
    const targets = await loadLinkTargets(db);
    expect(targets.users).toContainEqual({ id: linked.id, name: `${NAME} Person`, email: linked.email });
    expect(targets.users).toContainEqual(expect.objectContaining({ id: label.id, email: label.email }));
    expect(targets.links).toContainEqual({ id: artistId, name: `${NAME} Artist`, userId: linked.id });
  });

  it("loadLinkTargets refuses a listener", async () => {
    const listener = await createTestUser({ role: "listener" });
    try {
      const client = (await listener.signIn()) as unknown as SupabaseClient<Database>;
      await expect(loadLinkTargets(client)).rejects.toMatchObject({ name: "DomainError", code: "FORBIDDEN" });
    } finally {
      await listener.cleanup();
    }
  });
});
