// src/lib/supabase/catalog-numbers.data.test.ts
// Catalog numbers (migration 20261011170000): assigned on insert, unique,
// increasing, and immutable once set.
import { afterEach, describe, expect, it } from "vitest";
import { admin, cleanup, makeAlbum, makeSingle, newTag } from "./release-admin-fixtures";

let tag = "";
afterEach(() => cleanup(tag));

describe("catalog numbers", () => {
  it("tracks get increasing permanent numbers that survive edits", async () => {
    tag = newTag("CAT");
    const first = await makeSingle(`${tag}A`);
    const second = await makeSingle(`${tag}B`);
    const { data } = await admin.from("tracks").select("id, catalog_number").in("id", [first.trackId, second.trackId]);
    const byId = Object.fromEntries((data ?? []).map((r) => [r.id, r.catalog_number as number]));
    expect(byId[first.trackId]).toBeGreaterThan(0);
    expect(byId[second.trackId]).toBeGreaterThan(byId[first.trackId]);

    const { data: edited, error } = await admin.from("tracks").update({ title: `${tag}-renamed` }).eq("id", first.trackId).select("catalog_number").single();
    expect(error).toBeNull();
    expect(edited!.catalog_number).toBe(byId[first.trackId]);

    const { error: renumber } = await admin.from("tracks").update({ catalog_number: byId[second.trackId] + 100 }).eq("id", first.trackId);
    expect(renumber).not.toBeNull();
  });

  it("albums get increasing permanent numbers that survive edits", async () => {
    tag = newTag("CAT");
    const first = await makeAlbum(`${tag}A`, 1);
    const second = await makeAlbum(`${tag}B`, 1);
    const { data } = await admin.from("albums").select("id, catalog_number").in("id", [first.albumId, second.albumId]);
    const byId = Object.fromEntries((data ?? []).map((r) => [r.id, r.catalog_number as number]));
    expect(byId[first.albumId]).toBeGreaterThan(0);
    expect(byId[second.albumId]).toBeGreaterThan(byId[first.albumId]);

    const { data: edited, error } = await admin.from("albums").update({ title: `${tag}-renamed` }).eq("id", first.albumId).select("catalog_number").single();
    expect(error).toBeNull();
    expect(edited!.catalog_number).toBe(byId[first.albumId]);

    const { error: renumber } = await admin.from("albums").update({ catalog_number: byId[second.albumId] + 100 }).eq("id", first.albumId);
    expect(renumber).not.toBeNull();
  });
});
