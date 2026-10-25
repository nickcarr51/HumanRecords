// @vitest-environment node
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { findAlbum } from "@/lib/supabase/albums";
import { createDb } from "./client";

// Here, not next to albums.ts: only src/lib/db may build a Drizzle instance.
// Builds the album page's query text without running it: postgres.js opens a
// connection only on the first query, so this client never connects.
const db = createDb(postgres("postgresql://postgres:postgres@127.0.0.1:1/postgres", { max: 1 }));
const albumSql = findAlbum(db, "00000000-0000-4000-8000-000000000000").toSQL().sql;

describe("the album page's query", () => {
  it("doesn't ask for track art, as before Drizzle", () => {
    expect(albumSql).not.toContain("track_art_url");
  });
});
