// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, makeAlbum, makeSingle, newTag, signedIn } from "@/lib/supabase/release-admin-fixtures";
import { createTestUser } from "@/lib/supabase/test-helpers";
import { DomainError } from "./errors";
import * as service from "./releases";
import { getViewer } from "./viewer";

// The release services next to the SQL functions they replace. Each scenario
// runs twice on fresh data, once through the SQL function and once through
// the service, and both runs must end the same way: the same error (code and
// message) at each step and the same rows afterwards (releases, tracks and
// r2_cleanup_queue, with ids and tags replaced by labels).

type Err = { code: string; message: string } | null;
type Via = {
  archiveRelease(id: string): Promise<Err>;
  restoreRelease(id: string): Promise<Err>;
  archiveTrack(id: string): Promise<Err>;
  restoreTrack(id: string): Promise<Err>;
  replaceTrackAudio(id: string, key: string): Promise<Err>;
  moveRelease(id: string, direction: string): Promise<Err>;
};

const tags: string[] = [];
const userCleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const t of tags.splice(0)) await cleanup(t);
  for (const c of userCleanups.splice(0)) await c();
});

// The SQL functions' error codes, named as the services name them.
const BY_PG_CODE: Record<string, string> = { "42501": "FORBIDDEN", "22023": "INVALID", P0002: "NOT_FOUND" };

function viaFunction(client: SupabaseClient): Via {
  const call = async (fn: string, args: Record<string, unknown>): Promise<Err> => {
    const { error } = await client.rpc(fn, args);
    return error ? { code: BY_PG_CODE[error.code] ?? error.code, message: error.message } : null;
  };
  return {
    archiveRelease: (id) => call("archive_release", { p_release_id: id }),
    restoreRelease: (id) => call("restore_release", { p_release_id: id }),
    archiveTrack: (id) => call("archive_track", { p_track_id: id }),
    restoreTrack: (id) => call("restore_track", { p_track_id: id }),
    replaceTrackAudio: (id, key) => call("replace_track_audio", { p_track_id: id, p_audio_key: key }),
    moveRelease: (id, direction) => call("move_release", { target: id, direction }),
  };
}

async function viaService(client: SupabaseClient): Promise<Via> {
  const viewer = await getViewer(client);
  const call = async (run: () => Promise<void>): Promise<Err> => {
    try {
      await run();
      return null;
    } catch (e) {
      if (e instanceof DomainError) return { code: e.code, message: e.message };
      throw e;
    }
  };
  return {
    archiveRelease: (id) => call(() => service.archiveRelease(viewer, id)),
    restoreRelease: (id) => call(() => service.restoreRelease(viewer, id)),
    archiveTrack: (id) => call(() => service.archiveTrack(viewer, id)),
    restoreTrack: (id) => call(() => service.restoreTrack(viewer, id)),
    replaceTrackAudio: (id, key) => call(() => service.replaceTrackAudio(viewer, id, key)),
    moveRelease: (id, direction) => call(() => service.moveRelease(viewer, id, direction)),
  };
}

async function clientFor(role: "label_member" | "listener" | "artist"): Promise<SupabaseClient> {
  if (role !== "artist") return signedIn(role);
  const user = await createTestUser({ role });
  userCleanups.push(user.cleanup);
  return user.signIn();
}

// Runs a scenario through the SQL function, then through the service, each
// with its own tag, and checks both outcomes match. Returns the outcome.
async function both<T>(role: "label_member" | "listener" | "artist", scenario: (via: Via, tag: string) => Promise<T>) {
  const client = await clientFor(role);
  const outcomes: T[] = [];
  for (const via of [viaFunction(client), await viaService(client)]) {
    const tag = newTag("PAR");
    tags.push(tag);
    outcomes.push(await scenario(via, tag));
    await cleanup(tag);
  }
  expect(outcomes[1]).toEqual(outcomes[0]);
  return outcomes[1];
}

// The rows a scenario left behind, with ids and the tag replaced by labels.
// archived_at becomes null or a letter: equal letters are equal timestamps.
async function state(tag: string, labels: Record<string, string>) {
  const ids = Object.values(labels);
  const name = (id: string) => Object.keys(labels).find((k) => labels[k] === id) ?? id;
  const stamps: string[] = [];
  const stamp = (v: string | null) => {
    if (v === null) return null;
    if (!stamps.includes(v)) stamps.push(v);
    return String.fromCharCode(65 + stamps.indexOf(v));
  };
  const rel = await admin.from("releases").select("id, archived_at").in("id", ids).order("id");
  const trk = await admin.from("tracks").select("id, archived_at, audio_url").in("id", ids).order("id");
  const q = await admin
    .from("r2_cleanup_queue")
    .select("object_key, reason, source_table, source_id, cleaned_at")
    .like("object_key", `%${tag}%`);
  if (rel.error || trk.error || q.error) throw rel.error ?? trk.error ?? q.error;
  const sorted = <R extends { id: string }>(rows: R[]) => [...rows].sort((a, b) => name(a.id).localeCompare(name(b.id)));
  return {
    releases: sorted(rel.data).map((r) => [name(r.id), stamp(r.archived_at)]),
    tracks: sorted(trk.data).map((t) => [name(t.id), stamp(t.archived_at), t.audio_url.replaceAll(tag, "TAG")]),
    queue: q.data
      .map((r) => [r.object_key.replaceAll(tag, "TAG"), r.reason, r.source_table, name(r.source_id), r.cleaned_at !== null])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

async function album(tag: string, n: number, opts: { albumArt?: boolean } = {}) {
  const a = await makeAlbum(tag, n, opts);
  const labels: Record<string, string> = { release: a.releaseId, album: a.albumId };
  a.trackIds.forEach((id, i) => (labels[`t${i + 1}`] = id));
  return { ...a, labels };
}

async function single(tag: string, opts: { art?: boolean } = {}) {
  const s = await makeSingle(tag, opts);
  return { ...s, labels: { release: s.releaseId, track: s.trackId } };
}

async function markCleaned(tag: string, key: string) {
  const { error } = await admin.from("r2_cleanup_queue").update({ cleaned_at: new Date().toISOString() }).eq("object_key", key.replace("TAG", tag));
  if (error) throw error;
}

async function orphanTrack(tag: string): Promise<string> {
  const { data, error } = await admin
    .from("tracks")
    .insert({ title: `${tag}-Orphan`, audio_url: `tracks/${tag}-orphan.mp3` })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const UNKNOWN = "00000000-0000-4000-8000-000000000000";

describe("archiveRelease vs archive_release", () => {
  it("archives a single and its track together and queues audio + art", async () => {
    await both("label_member", async (via, tag) => {
      const s = await single(tag, { art: true });
      return [await via.archiveRelease(s.releaseId), await state(tag, s.labels)];
    });
  });

  it("archives an album's live tracks, queues album art, leaves an earlier-removed track alone", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await album(tag, 3, { albumArt: true });
      await admin.from("tracks").update({ archived_at: "2020-01-01T00:00:00Z" }).eq("id", a.trackIds[2]);
      return [await via.archiveRelease(a.releaseId), await state(tag, a.labels)];
    });
    expect(out[1]).toMatchObject({ releases: [["release", "A"]], tracks: [["t1", "A", expect.any(String)], ["t2", "A", expect.any(String)], ["t3", "B", expect.any(String)]] });
  });

  it("is a no-op the second time", async () => {
    await both("label_member", async (via, tag) => {
      const s = await single(tag);
      return [await via.archiveRelease(s.releaseId), await via.archiveRelease(s.releaseId), await state(tag, s.labels)];
    });
  });

  it("reports an unknown release", async () => {
    const out = await both("label_member", async (via) => via.archiveRelease(UNKNOWN));
    expect(out).toEqual({ code: "NOT_FOUND", message: "Release not found." });
  });

  it.each(["listener", "artist"] as const)("refuses the %s role and changes nothing", async (role) => {
    const out = await both(role, async (via, tag) => {
      const s = await single(tag);
      return [await via.archiveRelease(s.releaseId), await state(tag, s.labels)];
    });
    expect(out[0]).toEqual({ code: "FORBIDDEN", message: "Only label members can archive releases." });
  });
});

describe("restoreRelease vs restore_release", () => {
  it("brings back the tracks archived with the album, not one removed before (Monday/Tuesday)", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await album(tag, 3, { albumArt: true });
      const steps = [await via.archiveTrack(a.trackIds[1]), await via.archiveRelease(a.releaseId), await via.restoreRelease(a.releaseId)];
      return [steps, await state(tag, a.labels)];
    });
    expect(out[1]).toMatchObject({ releases: [["release", null]], tracks: [["t1", null, expect.any(String)], ["t2", "A", expect.any(String)], ["t3", null, expect.any(String)]] });
  });

  it("the service clears archived_with_release on the tracks it restores", async () => {
    const flags = async (ids: string[]) => {
      const { data, error } = await admin.from("tracks").select("id, archived_with_release").in("id", ids);
      if (error) throw error;
      return ids.map((id) => data.find((r) => r.id === id)?.archived_with_release);
    };
    const via = await viaService(await clientFor("label_member"));
    const tag = newTag("PAR");
    tags.push(tag);
    const a = await album(tag, 3);
    await via.archiveTrack(a.trackIds[1]);
    await via.archiveRelease(a.releaseId);
    expect(await flags(a.trackIds)).toEqual([true, false, true]);
    await via.restoreRelease(a.releaseId);
    expect(await flags(a.trackIds)).toEqual([false, false, false]);
  });

  it("the service flags the last track removed from an album and clears it on restore", async () => {
    const flags = async (ids: string[]) => {
      const { data, error } = await admin.from("tracks").select("id, archived_with_release").in("id", ids);
      if (error) throw error;
      return ids.map((id) => data.find((r) => r.id === id)?.archived_with_release);
    };
    const via = await viaService(await clientFor("label_member"));
    const tag2 = newTag("PAR");
    tags.push(tag2);
    const b = await album(tag2, 2);
    await via.archiveTrack(b.trackIds[0]);
    await via.archiveTrack(b.trackIds[1]);
    expect(await flags(b.trackIds)).toEqual([false, true]);
    await via.restoreRelease(b.releaseId);
    expect(await flags(b.trackIds)).toEqual([false, false]);
  });

  it("restores a single and drops its queue rows", async () => {
    await both("label_member", async (via, tag) => {
      const s = await single(tag, { art: true });
      return [await via.archiveRelease(s.releaseId), await via.restoreRelease(s.releaseId), await state(tag, s.labels)];
    });
  });

  it("is a no-op for a live release", async () => {
    await both("label_member", async (via, tag) => {
      const s = await single(tag);
      return [await via.restoreRelease(s.releaseId), await state(tag, s.labels)];
    });
  });

  it("refuses when a file was already deleted from storage", async () => {
    const out = await both("label_member", async (via, tag) => {
      const s = await single(tag);
      await via.archiveRelease(s.releaseId);
      await markCleaned(tag, "tracks/TAG-1.mp3");
      return [await via.restoreRelease(s.releaseId), await state(tag, s.labels)];
    });
    expect(out[0]).toEqual({ code: "INVALID", message: "Some files for this release were already deleted from storage; it can't be restored." });
  });

  it("refuses when the album art was already deleted from storage", async () => {
    await both("label_member", async (via, tag) => {
      const a = await album(tag, 2, { albumArt: true });
      await via.archiveRelease(a.releaseId);
      await markCleaned(tag, "art/TAG-album.jpg");
      return [await via.restoreRelease(a.releaseId), await state(tag, a.labels)];
    });
  });

  it("reports an unknown release", async () => {
    const out = await both("label_member", async (via) => via.restoreRelease(UNKNOWN));
    expect(out).toEqual({ code: "NOT_FOUND", message: "Release not found." });
  });

  it.each(["listener", "artist"] as const)("refuses the %s role", async (role) => {
    const out = await both(role, async (via, tag) => {
      const s = await single(tag);
      return via.restoreRelease(s.releaseId);
    });
    expect(out).toEqual({ code: "FORBIDDEN", message: "Only label members can restore releases." });
  });
});

describe("archiveTrack vs archive_track", () => {
  it("removes one album track and queues its files; the second call is a no-op", async () => {
    await both("label_member", async (via, tag) => {
      const a = await album(tag, 2);
      await admin.from("tracks").update({ track_art_url: `art/${tag}-1.jpg` }).eq("id", a.trackIds[0]);
      return [await via.archiveTrack(a.trackIds[0]), await via.archiveTrack(a.trackIds[0]), await state(tag, a.labels)];
    });
  });

  it("removing the last live track archives the album; restoring the album brings only that track back", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await album(tag, 2, { albumArt: true });
      const removed = [await via.archiveTrack(a.trackIds[0]), await via.archiveTrack(a.trackIds[1])];
      const archived = await state(tag, a.labels);
      return [removed, archived, await via.restoreRelease(a.releaseId), await state(tag, a.labels)];
    });
    expect(out[1]).toMatchObject({ releases: [["release", "A"]], tracks: [["t1", "B", expect.any(String)], ["t2", "A", expect.any(String)]] });
    expect(out[3]).toMatchObject({ releases: [["release", null]], tracks: [["t1", "A", expect.any(String)], ["t2", null, expect.any(String)]] });
  });

  it("removing the last live track twice is a no-op the second time", async () => {
    await both("label_member", async (via, tag) => {
      const a = await album(tag, 2);
      const steps = [await via.archiveTrack(a.trackIds[0]), await via.archiveTrack(a.trackIds[1]), await via.archiveTrack(a.trackIds[1])];
      return [steps, await state(tag, a.labels)];
    });
  });

  it("refuses a single's track", async () => {
    const out = await both("label_member", async (via, tag) => {
      const s = await single(tag);
      return [await via.archiveTrack(s.trackId), await state(tag, s.labels)];
    });
    expect(out[0]).toEqual({ code: "INVALID", message: "Archive the single instead." });
  });

  it("refuses a live track on an archived album", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await album(tag, 2);
      await via.archiveRelease(a.releaseId);
      await admin.from("tracks").update({ archived_at: null }).eq("id", a.trackIds[0]);
      return [await via.archiveTrack(a.trackIds[0]), await state(tag, a.labels)];
    });
    expect(out[0]).toEqual({ code: "INVALID", message: "This album is archived." });
  });

  it("reports an unknown track and an orphan track", async () => {
    const out = await both("label_member", async (via, tag) => [await via.archiveTrack(UNKNOWN), await via.archiveTrack(await orphanTrack(tag))]);
    expect(out).toEqual([
      { code: "NOT_FOUND", message: "Track not found." },
      { code: "NOT_FOUND", message: "Track not found." },
    ]);
  });

  it.each(["listener", "artist"] as const)("refuses the %s role", async (role) => {
    const out = await both(role, async (via, tag) => {
      const a = await album(tag, 2);
      return [await via.archiveTrack(a.trackIds[0]), await state(tag, a.labels)];
    });
    expect(out[0]).toEqual({ code: "FORBIDDEN", message: "Only label members can remove tracks." });
  });
});

describe("restoreTrack vs restore_track", () => {
  it("restores a removed track and drops its queue rows; a live track is a no-op", async () => {
    await both("label_member", async (via, tag) => {
      const a = await album(tag, 2);
      const steps = [await via.archiveTrack(a.trackIds[0]), await via.restoreTrack(a.trackIds[0]), await via.restoreTrack(a.trackIds[1])];
      return [steps, await state(tag, a.labels)];
    });
  });

  it("refuses while the album is archived", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await album(tag, 2);
      await via.archiveRelease(a.releaseId);
      return [await via.restoreTrack(a.trackIds[0]), await state(tag, a.labels)];
    });
    expect(out[0]).toEqual({ code: "INVALID", message: "Restore the album first." });
  });

  it("refuses when the track's file was already deleted from storage", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await album(tag, 2);
      await via.archiveTrack(a.trackIds[0]);
      await markCleaned(tag, "tracks/TAG-1.mp3");
      return [await via.restoreTrack(a.trackIds[0]), await state(tag, a.labels)];
    });
    expect(out[0]).toEqual({ code: "INVALID", message: "This track's file was already deleted from storage." });
  });

  it("refuses a single's track", async () => {
    const out = await both("label_member", async (via, tag) => {
      const s = await single(tag);
      return via.restoreTrack(s.trackId);
    });
    expect(out).toEqual({ code: "INVALID", message: "Restore the single instead." });
  });

  it("reports an unknown track", async () => {
    const out = await both("label_member", async (via) => via.restoreTrack(UNKNOWN));
    expect(out).toEqual({ code: "NOT_FOUND", message: "Track not found." });
  });

  it.each(["listener", "artist"] as const)("refuses the %s role", async (role) => {
    const out = await both(role, async (via, tag) => {
      const a = await album(tag, 2);
      return via.restoreTrack(a.trackIds[0]);
    });
    expect(out).toEqual({ code: "FORBIDDEN", message: "Only label members can restore tracks." });
  });
});

describe("replaceTrackAudio vs replace_track_audio", () => {
  it("swaps the file and queues the old one as replaced", async () => {
    await both("label_member", async (via, tag) => {
      const s = await single(tag);
      return [await via.replaceTrackAudio(s.trackId, `tracks/${tag}-v2.mp3`), await state(tag, s.labels)];
    });
  });

  it("refuses the same key, a blank key and an archived track; a tab is not blank (Postgres trim)", async () => {
    const out = await both("label_member", async (via, tag) => {
      const s = await single(tag);
      const steps = [
        await via.replaceTrackAudio(s.trackId, `tracks/${tag}-1.mp3`),
        await via.replaceTrackAudio(s.trackId, "   "),
        await via.replaceTrackAudio(s.trackId, "\t"),
        await via.archiveRelease(s.releaseId),
        await via.replaceTrackAudio(s.trackId, `tracks/${tag}-v2.mp3`),
      ];
      return [steps, await state(tag, s.labels)];
    });
    expect(out[0]).toEqual([
      { code: "INVALID", message: "That file is already on this track." },
      { code: "INVALID", message: "No audio file." },
      null,
      null,
      { code: "INVALID", message: "Restore this track before replacing its file." },
    ]);
  });

  it("reports an unknown track and an orphan track", async () => {
    const out = await both("label_member", async (via, tag) => {
      const orphan = await orphanTrack(tag);
      return [
        await via.replaceTrackAudio(UNKNOWN, `tracks/${tag}-v2.mp3`),
        await via.replaceTrackAudio(orphan, `tracks/${tag}-v2.mp3`),
        await state(tag, { orphan }),
      ];
    });
    expect(out.slice(0, 2)).toEqual([
      { code: "NOT_FOUND", message: "Track not found." },
      { code: "NOT_FOUND", message: "Track not found." },
    ]);
  });

  it.each(["listener", "artist"] as const)("refuses the %s role", async (role) => {
    const out = await both(role, async (via, tag) => {
      const s = await single(tag);
      return via.replaceTrackAudio(s.trackId, `tracks/${tag}-v2.mp3`);
    });
    expect(out).toEqual({ code: "FORBIDDEN", message: "Only label members can replace files." });
  });
});

describe("moveRelease vs move_release", () => {
  // Releases far in the future sit at the top of their pinned group, so only
  // they decide the moves. Fixed ids make the two runs identical row for row.
  const id = (n: number, scenario: number) => `${String(scenario).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

  async function release(tag: string, ids: string, sortAt: string, pinned = false, archived = false) {
    await admin.from("releases").delete().eq("id", ids);
    const { data: t, error } = await admin
      .from("tracks")
      .insert({ title: `${tag}-move`, audio_url: `tracks/${tag}-move.mp3` })
      .select("id")
      .single();
    if (error) throw error;
    const { error: rErr } = await admin.from("releases").insert({ id: ids, kind: "single", track_id: t.id, sort_at: sortAt, pinned, archived_at: archived ? "2020-01-01T00:00:00Z" : null });
    if (rErr) throw rErr;
  }

  async function rows(ids: string[]) {
    const { data, error } = await admin.from("releases").select("id, sort_at, pinned").in("id", ids);
    if (error) throw error;
    return Object.fromEntries(data.map((r) => [r.id, [r.sort_at, r.pinned]]));
  }

  type Row = { at: string; pinned?: true; archived?: true };
  const scenarios: Array<[string, number, Row[], Array<[number, string]>]> = [
    ["up and down one place", 2901, [{ at: "2901-03-01T00:00:00Z" }, { at: "2901-02-01T00:00:00Z" }, { at: "2901-01-01T00:00:00Z" }], [[2, "up"], [0, "down"]]],
    ["the neighbour has an identical sort_at", 2902, [{ at: "2902-01-01T00:00:00Z" }, { at: "2902-01-01T00:00:00Z" }], [[0, "up"], [1, "up"]]],
    ["three releases share a sort_at", 2903, [{ at: "2903-01-01T00:00:00Z" }, { at: "2903-01-01T00:00:00Z" }, { at: "2903-01-01T00:00:00Z" }], [[0, "up"], [2, "down"]]],
    ["a third row is tied with the current one", 2904, [{ at: "2904-01-02T00:00:00Z" }, { at: "2904-01-02T00:00:00Z" }, { at: "2904-01-01T00:00:00Z" }], [[0, "down"], [1, "down"]]],
    ["a third row sits exactly 1 ms below a tied pair", 2905, [{ at: "2905-01-01T00:00:00.000Z" }, { at: "2905-01-01T00:00:00.000Z" }, { at: "2904-12-31T23:59:59.999Z" }], [[0, "down"], [1, "down"]]],
    ["a sub-millisecond gap below a tied pair", 2906, [{ at: "2906-01-01T00:00:00.000000Z" }, { at: "2906-01-01T00:00:00.000000Z" }, { at: "2905-12-31T23:59:59.999500Z" }], [[0, "down"], [1, "down"]]],
    ["well-separated releases (fast path)", 2907, [{ at: "2907-01-03T00:00:00Z" }, { at: "2907-01-02T00:00:00Z" }, { at: "2907-01-01T00:00:00Z" }], [[0, "down"]]],
    ["a tie next to a row already spaced apart", 2908, [{ at: "2908-01-02T00:00:00Z" }, { at: "2908-01-02T00:00:00Z" }, { at: "2907-06-01T00:00:00Z" }], [[1, "down"]]],
    ["the top of the unpinned group, under a pinned release", 2909, [{ at: "2000-01-01T00:00:00Z", pinned: true }, { at: "2909-01-01T00:00:00Z" }], [[1, "up"]]],
    ["a tie inside the pinned group, next to an archived pinned release", 2910, [{ at: "2910-01-02T00:00:00Z", pinned: true }, { at: "2910-01-02T00:00:00Z", pinned: true }, { at: "2910-01-02T00:00:00Z", pinned: true, archived: true }, { at: "2910-01-01T00:00:00Z", pinned: true }], [[1, "down"], [0, "down"]]],
  ];

  it.each(scenarios)("same sort_at values after moves: %s", async (_name, scenario, fixture, moves) => {
    await both("label_member", async (via, tag) => {
      const ids = fixture.map((_, n) => id(n, scenario));
      for (const [n, row] of fixture.entries()) await release(tag, ids[n], row.at, row.pinned ?? false, row.archived ?? false);
      const errors: Err[] = [];
      for (const [n, direction] of moves) errors.push(await via.moveRelease(ids[n], direction));
      const after = await rows(ids);
      await admin.from("releases").delete().in("id", ids);
      return [errors, after];
    });
  });

  it("refuses an archived release, an unknown release and a bad direction", async () => {
    const out = await both("label_member", async (via, tag) => {
      const s = await single(tag);
      await via.archiveRelease(s.releaseId);
      return [
        await via.moveRelease(s.releaseId, "up"),
        await via.moveRelease(UNKNOWN, "up"),
        await via.moveRelease(UNKNOWN, "sideways"),
      ];
    });
    expect(out).toEqual([
      { code: "INVALID", message: "Archived releases cannot be moved." },
      { code: "NOT_FOUND", message: "Release not found." },
      { code: "INVALID", message: "direction must be up or down" },
    ]);
  });

  it.each(["listener", "artist"] as const)("refuses the %s role", async (role) => {
    const out = await both(role, async (via, tag) => {
      const s = await single(tag);
      return via.moveRelease(s.releaseId, "up");
    });
    expect(out).toEqual({ code: "FORBIDDEN", message: "Only label members can reorder releases." });
  });
});
