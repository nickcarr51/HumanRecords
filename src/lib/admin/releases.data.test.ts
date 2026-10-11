// src/lib/admin/releases.data.test.ts
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { admin, cleanup, makeAlbum, makeSingle, newTag, signedIn } from "@/lib/supabase/release-admin-fixtures";
import { getAdminRelease, getAdminReleases } from "./releases";

let tag = "";
afterEach(() => cleanup(tag));

async function labelDb() {
  return (await signedIn()) as unknown as SupabaseClient<Database>;
}

describe("getAdminReleases", () => {
  it("lists live and archived releases in feed order with live track counts", async () => {
    tag = newTag("ADM");
    // Fixtures name artists `${tag}-A<n>` (unique, case-insensitive), so the single gets its own tag.
    const single = await makeSingle(`${tag}S`);
    const album = await makeAlbum(tag, 3);
    await admin.from("releases").update({ sort_at: "2999-01-01T00:00:00Z" }).eq("id", single.releaseId);
    await admin.from("releases").update({ sort_at: "2998-01-01T00:00:00Z", pinned: true }).eq("id", album.releaseId);
    await admin.from("tracks").update({ archived_at: new Date().toISOString() }).eq("id", album.trackIds[2]);
    const archived = await makeSingle(`${tag}Z`);
    await admin.from("releases").update({ archived_at: new Date().toISOString(), sort_at: "2997-01-01T00:00:00Z" }).eq("id", archived.releaseId);

    const rows = (await getAdminReleases(await labelDb())).filter((r) => r.title.startsWith(tag));
    expect(rows.map((r) => r.id)).toEqual([album.releaseId, single.releaseId, archived.releaseId]);
    expect(rows[0]).toMatchObject({ kind: "album", title: `${tag}-Album`, pinned: true, archived: false, liveTrackCount: 2, artistNames: [] });
    expect(rows[1]).toMatchObject({ kind: "single", title: `${tag}S-T1`, artistNames: [`${tag}S-A1`], liveTrackCount: 1 });
    expect(rows[2]).toMatchObject({ archived: true });
    await cleanup(`${tag}Z`);
  });
});

describe("getAdminRelease", () => {
  it("returns an album with every track (archived flagged) in position order", async () => {
    tag = newTag("ADM");
    const album = await makeAlbum(tag, 2);
    await admin.from("tracks").update({ archived_at: new Date().toISOString() }).eq("id", album.trackIds[0]);
    const r = await getAdminRelease(await labelDb(), album.releaseId);
    expect(r).toMatchObject({ id: album.releaseId, kind: "album", title: `${tag}-Album`, archived: false, album: { title: `${tag}-Album`, artists: [] } });
    expect(r!.tracks.map((t) => [t.id, t.archived])).toEqual([[album.trackIds[0], true], [album.trackIds[1], false]]);
    expect(r!.tracks[1].artists[0].name).toBe(`${tag}-A2`);
  });

  it("returns null for a non-UUID or unknown id", async () => {
    tag = newTag("ADM");
    const db = await labelDb();
    expect(await getAdminRelease(db, "nope")).toBeNull();
    expect(await getAdminRelease(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
