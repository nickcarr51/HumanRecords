// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeed } from "./feed";
import { createAdminClient, createTestUser } from "./test-helpers";

// The real cap is 1000 rows. It is lowered to 2 here so three test singles
// are enough to show getFeed applies it.
vi.mock("@/lib/db/max-rows", () => ({ MAX_ROWS: 2 }));

const admin = createAdminClient();
const tag = `CAP${Date.now()}`;
const created = { releases: [] as string[], tracks: [] as string[] };
let user: Awaited<ReturnType<typeof createTestUser>>;
let client: SupabaseClient;

beforeAll(async () => {
  for (const n of [1, 2, 3]) {
    const t = await admin.from("tracks").insert({ title: `${tag} ${n}`, audio_url: "tracks/x.mp3" }).select("id").single();
    if (t.error) throw t.error;
    created.tracks.push(t.data.id);
    const r = await admin.from("releases").insert({ kind: "single", track_id: t.data.id }).select("id").single();
    if (r.error) throw r.error;
    created.releases.push(r.data.id);
  }
  user = await createTestUser();
  client = await user.signIn();
});

// Guarded: when setup failed part-way, clean up only what was created.
afterAll(async () => {
  try {
    for (const table of ["releases", "tracks"] as const) {
      const ids = created[table].splice(0);
      if (!ids.length) continue;
      const { error } = await admin.from(table).delete().in("id", ids);
      if (error) throw error;
    }
  } finally {
    if (user) await user.cleanup();
  }
});

describe("getFeed row cap", () => {
  it("returns at most the cap even when the page size is larger (1500), with the exact total", async () => {
    const page = await getFeed(client, { q: tag, pageSize: 1500 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
  });
});
