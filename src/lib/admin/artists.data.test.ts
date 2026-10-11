import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { getAdminArtist, getCreditCounts, listAdminArtists } from "./artists";

const admin = createAdminClient();
const artistIds: string[] = [];
const trackIds: string[] = [];
let label: Awaited<ReturnType<typeof createTestUser>>;
let db: SupabaseClient<Database>;
const PREFIX = `ADM-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  label = await createTestUser({ role: "label_member", name: "Linked Person" });
  db = (await label.signIn()) as unknown as SupabaseClient<Database>;
});
afterAll(async () => label.cleanup());
afterEach(async () => {
  if (trackIds.length) await admin.from("tracks").delete().in("id", trackIds.splice(0));
  if (artistIds.length) await admin.from("artists").delete().in("id", artistIds.splice(0));
});

async function seed(name: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin.from("artists").insert({ name, ...extra }).select("id").single();
  if (error) throw error;
  artistIds.push(data.id);
  return data.id as string;
}

describe("admin artists reads", () => {
  it("lists with counts and the linked user, searched literally", async () => {
    const a = await seed(`${PREFIX} 100%`, { user_id: label.id, bio: "b" });
    await seed(`${PREFIX} other`);
    const { data: t } = await admin.from("tracks").insert({ title: "ADM", audio_url: "tracks/x.mp3" }).select("id").single();
    trackIds.push(t!.id);
    await admin.from("track_artists").insert({ track_id: t!.id, artist_id: a, position: 1 });

    const page = await listAdminArtists(db, { query: `${PREFIX} 100%` });
    expect(page.total).toBe(1);
    expect(page.artists[0]).toMatchObject({
      id: a,
      trackCount: 1,
      albumCount: 0,
      linkedUser: { id: label.id, name: "Linked Person", email: label.email },
    });

    expect(await getCreditCounts(db, a)).toEqual({ tracks: 1, albums: 0 });
    const detail = await getAdminArtist(db, a);
    expect(detail).toMatchObject({ id: a, bio: "b", trackCount: 1 });
  });

  it("returns an empty page with the true total when page is past the end", async () => {
    await seed(`${PREFIX} one`);
    await seed(`${PREFIX} two`);
    const page = await listAdminArtists(db, { query: PREFIX, page: 999 });
    expect(page.artists).toEqual([]);
    expect(page.total).toBe(2);
    expect(page.page).toBe(999);
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await getAdminArtist(db, randomUUID())).toBeNull();
    expect(await getAdminArtist(db, "nope")).toBeNull();
  });
});
