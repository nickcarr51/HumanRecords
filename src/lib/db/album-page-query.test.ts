// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { findAlbum, getAlbum } from "@/lib/supabase/albums";
import type { Database } from "@/lib/supabase/database.types";
import { createDb } from "./client";

// getAlbum's own query, captured: asUser is replaced by a stand-in that runs
// the callback against `db` and keeps the SQL it builds.
const { sent } = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock("@/lib/services/viewer", () => ({ getClaims: async () => ({ sub: "u1" }) }));
vi.mock("@/lib/db/user", () => ({
  asUser: async (_claims: unknown, fn: (tx: typeof db) => { toSQL: () => { sql: string } }) => {
    sent.push(fn(db).toSQL().sql);
    return undefined;
  },
}));

// Here, not next to albums.ts: only src/lib/db may build a Drizzle instance.
// Builds the album page's query text without running it: postgres.js opens a
// connection only on the first query, so this client never connects.
const db = createDb(postgres("postgresql://postgres:postgres@127.0.0.1:1/postgres", { max: 1 }));
const id = "00000000-0000-4000-8000-000000000000";
const albumSql = findAlbum(db, id).toSQL().sql;

describe("the album page's query", () => {
  it("doesn't ask for track art, as before Drizzle", () => {
    expect(albumSql).not.toContain("track_art_url");
  });

  it("is the query getAlbum sends", async () => {
    // Never used: getClaims is replaced above, and no request is made.
    const client = createClient<Database>("http://127.0.0.1:1", "unused");
    expect(await getAlbum(client, id)).toBeNull();
    expect(sent).toEqual([albumSql]);
  });
});
