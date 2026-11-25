// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, makeAlbum, makeArtist, makeSingle, newTag, signedIn } from "@/lib/supabase/release-admin-fixtures";
import { createTestUser } from "@/lib/supabase/test-helpers";
import type { AddTrackPayload, ReleaseEditPayload, ReleasePayload } from "@/lib/admin/types";
import { DomainError } from "./errors";
import * as service from "./releases";
import { getViewer } from "./viewer";

// publishRelease, updateRelease and addAlbumTrack next to the SQL functions
// they replace (publish_release, update_release, add_album_track, and their
// helper resolve_artist_refs). Each scenario runs twice on fresh data, once
// through the SQL function and once through the service, and both runs must
// end the same way: the same error at each step and the same rows afterwards
// (tracks, credits, albums, positions, releases and artists, with the tag
// replaced by TAG; catalog numbers compared by their order). Payloads are the
// shapes the actions let through; the actions refuse any other shape.

type Err = { code: string; message: string } | null;
type Done = { err: Err; id: string | null };
type Via = {
  publish(payload: ReleasePayload): Promise<Done>;
  update(releaseId: string, payload: ReleaseEditPayload): Promise<Done>;
  add(releaseId: string, payload: AddTrackPayload): Promise<Done>;
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
  const call = async (fn: string, args: Record<string, unknown>): Promise<Done> => {
    const { data, error } = await client.rpc(fn, args);
    if (!error) return { err: null, id: (data as string | null) ?? null };
    return { err: { code: BY_PG_CODE[error.code] ?? error.code, message: error.message }, id: null };
  };
  return {
    publish: (payload) => call("publish_release", { payload }),
    update: (releaseId, payload) => call("update_release", { p_release_id: releaseId, payload }),
    add: (releaseId, payload) => call("add_album_track", { p_release_id: releaseId, payload }),
  };
}

async function viaService(client: SupabaseClient): Promise<Via> {
  const viewer = await getViewer(client);
  const call = async (run: () => Promise<string | void>): Promise<Done> => {
    try {
      return { err: null, id: (await run()) ?? null };
    } catch (e) {
      if (e instanceof DomainError) return { err: { code: e.code, message: e.message }, id: null };
      throw e;
    }
  };
  return {
    publish: (payload) => call(() => service.publishRelease(viewer, payload)),
    update: (releaseId, payload) => call(() => service.updateRelease(viewer, releaseId, payload)),
    add: (releaseId, payload) => call(() => service.addAlbumTrack(viewer, releaseId, payload)),
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
    const tag = newTag("PUB");
    tags.push(tag);
    outcomes.push(await scenario(via, tag));
    await cleanup(tag);
  }
  expect(outcomes[1]).toEqual(outcomes[0]);
  return outcomes[1];
}

type Credit = { position: number; artists: { name: string } | null };
const names = (credits: Credit[], tag: string) =>
  [...credits].sort((a, b) => a.position - b.position).map((c) => c.artists?.name.replaceAll(tag, "TAG"));

// Every row the scenario left behind that carries the tag. Tracks come in
// catalog-number order (so equal lists mean the numbers were handed out in
// the same order); a returned id is shown as the label of the row it names.
async function state(tag: string, returned: string | null = null) {
  const T = (s: string) => s.replaceAll(tag, "TAG");
  const trk = await admin
    .from("tracks")
    .select("id, title, audio_url, archived_at, catalog_number, track_artists(position, artists(name)), track_albums(position)")
    .like("title", `${tag}%`)
    .order("catalog_number");
  const alb = await admin
    .from("albums")
    .select("id, title, catalog_number, album_artists(position, artists(name))")
    .like("title", `${tag}%`)
    .order("catalog_number");
  const art = await admin.from("artists").select("name").ilike("name", `${tag}%`);
  if (trk.error || alb.error || art.error) throw trk.error ?? alb.error ?? art.error;
  const trackIds = trk.data.map((t) => t.id);
  const albumIds = alb.data.map((a) => a.id);
  const rel = await admin
    .from("releases")
    .select("id, kind, track_id, album_id, pinned, archived_at, sort_at, created_at")
    .or(`track_id.in.(${trackIds.join(",") || "00000000-0000-0000-0000-000000000000"}),album_id.in.(${albumIds.join(",") || "00000000-0000-0000-0000-000000000000"})`);
  if (rel.error) throw rel.error;
  const titleOf = (id: string | null) =>
    T(trk.data.find((t) => t.id === id)?.title ?? alb.data.find((a) => a.id === id)?.title ?? String(id));
  return {
    returned: returned === null ? null : (rel.data.find((r) => r.id === returned) ? "release" : titleOf(returned)),
    tracks: trk.data.map((t) => ({
      title: T(t.title),
      audio: T(t.audio_url),
      archived: t.archived_at !== null,
      artists: names(t.track_artists as unknown as Credit[], tag),
      position: (t.track_albums as unknown as Array<{ position: number }>)[0]?.position ?? null,
    })),
    albums: alb.data.map((a) => ({
      title: T(a.title),
      numbered: a.catalog_number !== null,
      artists: names(a.album_artists as unknown as Credit[], tag),
    })),
    releases: rel.data
      .map((r) => ({
        kind: r.kind,
        of: titleOf(r.track_id ?? r.album_id),
        pinned: r.pinned,
        archived: r.archived_at !== null,
        sortAtIsCreatedAt: r.sort_at === r.created_at,
      }))
      .sort((a, b) => a.of.localeCompare(b.of)),
    artists: art.data.map((a) => T(a.name)).sort(),
  };
}

const KEY = (tag: string, n: number) => `tracks/${tag}-new${n}.mp3`;
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

// The edit page's draft of a fixture release: each live track with its id,
// its title and its fixture artist.
function draftOf(tag: string, ids: string[]) {
  return ids.map((id) => ({ id, title: `${tag} Edited ${ids.indexOf(id) + 1}`, artists: [{ newName: `${tag} Editor` }] }));
}

async function removeTrack(id: string) {
  const { error } = await admin.from("tracks").update({ archived_at: "2020-01-01T00:00:00Z" }).eq("id", id);
  if (error) throw error;
}

async function archiveRelease(id: string) {
  const { error } = await admin.from("releases").update({ archived_at: "2020-01-01T00:00:00Z" }).eq("id", id);
  if (error) throw error;
}

describe("publishRelease vs publish_release", () => {
  it("publishes a single with ordered artists: a new one, an existing one, a repeat dropped", async () => {
    const out = await both("label_member", async (via, tag) => {
      const existing = await makeArtist(`${tag} Existing`);
      const done = await via.publish({
        kind: "single",
        tracks: [
          {
            title: `${tag} Song`,
            audioKey: KEY(tag, 1),
            artists: [{ newName: `${tag} Brand New` }, { id: existing }, { newName: `  ${tag} EXISTING ` }],
          },
        ],
      });
      return [done.err, await state(tag, done.id)];
    });
    expect(out[1]).toMatchObject({
      returned: "release",
      tracks: [{ title: "TAG Song", artists: ["TAG Brand New", "TAG Existing"], position: null }],
      releases: [{ kind: "single", of: "TAG Song", pinned: false, archived: false, sortAtIsCreatedAt: true }],
      artists: ["TAG Brand New", "TAG Existing"],
    });
  });

  it("publishes an album: tracks numbered in order, positions, album artists", async () => {
    const out = await both("label_member", async (via, tag) => {
      const done = await via.publish({
        kind: "album",
        album: { title: `  ${tag} LP  `, artists: [{ newName: `${tag} Band` }, { newName: `${tag} Guest` }] },
        tracks: [1, 2, 3].map((n) => ({ title: `${tag} Side ${n}`, audioKey: KEY(tag, n), artists: [{ newName: `${tag} Band` }] })),
      });
      return [done.err, await state(tag, done.id)];
    });
    expect(out[1]).toMatchObject({
      returned: "release",
      tracks: [1, 2, 3].map((n) => ({ title: `TAG Side ${n}`, artists: ["TAG Band"], position: n })),
      albums: [{ title: "TAG LP", numbered: true, artists: ["TAG Band", "TAG Guest"] }],
      releases: [{ kind: "album", of: "TAG LP", sortAtIsCreatedAt: true }],
    });
  });

  it("keeps a new artist's spelling from the first track when the album types it in another case", async () => {
    const out = await both("label_member", async (via, tag) => {
      const done = await via.publish({
        kind: "album",
        album: { title: `${tag} LP`, artists: [{ newName: `${tag} DJ NOVA` }] },
        tracks: [1, 2].map((n) => ({ title: `${tag} T${n}`, audioKey: KEY(tag, n), artists: [{ newName: `${tag} dj nova` }] })),
      });
      return [done.err, await state(tag, done.id)];
    });
    expect(out[1]).toMatchObject({ albums: [{ artists: ["TAG dj nova"] }], artists: ["TAG dj nova"] });
  });

  it("publishes an album with no album artists", async () => {
    await both("label_member", async (via, tag) => {
      const tracks = [1, 2].map((n) => ({ title: `${tag} T${n}`, audioKey: KEY(tag, n), artists: [{ newName: `${tag} A` }] }));
      const done = await via.publish({ kind: "album", album: { title: `${tag} No credits`, artists: [] }, tracks });
      return [done.err, await state(tag)];
    });
  });

  it("trims titles and new artist names, and keeps the audio key as sent", async () => {
    const out = await both("label_member", async (via, tag) => {
      const done = await via.publish({
        kind: "single",
        tracks: [{ title: `  ${tag} Spaced  `, audioKey: ` ${KEY(tag, 1)}`, artists: [{ newName: `${tag} Spaced Artist  ` }] }],
      });
      return [done.err, await state(tag)];
    });
    expect(out[1]).toMatchObject({ tracks: [{ title: "TAG Spaced", audio: " tracks/TAG-new1.mp3" }], artists: ["TAG Spaced Artist"] });
  });

  it("accepts an existing artist's id in upper case", async () => {
    await both("label_member", async (via, tag) => {
      const existing = await makeArtist(`${tag} Upper`);
      const done = await via.publish({
        kind: "single",
        tracks: [{ title: `${tag} Song`, audioKey: KEY(tag, 1), artists: [{ id: existing.toUpperCase() }] }],
      });
      return [done.err, await state(tag)];
    });
  });

  const single = (tag: string, track: Partial<ReleasePayload["tracks"][number]>): ReleasePayload => ({
    kind: "single",
    tracks: [{ title: `${tag} Song`, audioKey: KEY(tag, 1), artists: [{ newName: `${tag} A` }], ...track }],
  });
  const album = (tag: string, extra: Partial<ReleasePayload> = {}): ReleasePayload => ({
    kind: "album",
    album: { title: `${tag} LP`, artists: [] },
    tracks: [1, 2].map((n) => ({ title: `${tag} T${n}`, audioKey: KEY(tag, n), artists: [{ newName: `${tag} A${n}` }] })),
    ...extra,
  });

  it.each([
    ["a single with two tracks", (tag: string) => ({ ...album(tag), kind: "single", album: undefined }), "A single has exactly one track."],
    ["a single with album details", (tag: string) => ({ ...single(tag, {}), album: { title: "x", artists: [] } }), "A single has no album details."],
    ["an album with one track", (tag: string) => ({ ...album(tag), tracks: album(tag).tracks.slice(1) }), "An album needs at least 2 tracks."],
    ["an album with a blank title", (tag: string) => album(tag, { album: { title: "   ", artists: [] } }), "Album title is required."],
    ["an album with no album details", (tag: string) => album(tag, { album: undefined }), "Album title is required."],
    ["a blank track title", (tag: string) => single(tag, { title: " " }), "Track 1 needs a title."],
    ["no artists", (tag: string) => single(tag, { artists: [] }), "Track 1 needs at least one artist."],
    ["an unknown artist", (tag: string) => single(tag, { artists: [{ id: UNKNOWN }] }), "Unknown artist."],
  ] as Array<[string, (tag: string) => ReleasePayload, string]>)("refuses %s and saves nothing", async (_what, payload, message) => {
    const out = await both("label_member", async (via, tag) => {
      const done = await via.publish(payload(tag));
      return [done.err, await state(tag)];
    });
    expect(out[0]).toEqual({ code: "INVALID", message });
  });
  it("refuses track 2's blank title after track 1 was saved, and keeps nothing (artists included)", async () => {
    const out = await both("label_member", async (via, tag) => {
      const done = await via.publish({
        ...album(tag),
        tracks: [
          { title: `${tag} One`, audioKey: KEY(tag, 1), artists: [{ newName: `${tag} Made First` }] },
          { title: "", audioKey: KEY(tag, 2), artists: [{ newName: `${tag} B` }] },
        ],
      });
      return [done.err, await state(tag)];
    });
    expect(out).toEqual([
      { code: "INVALID", message: "Track 2 needs a title." },
      { returned: null, tracks: [], albums: [], releases: [], artists: [] },
    ]);
  });

  it.each(["listener", "artist"] as const)("refuses the %s role and saves nothing", async (role) => {
    const out = await both(role, async (via, tag) => {
      const done = await via.publish({
        kind: "single",
        tracks: [{ title: `${tag} Song`, audioKey: KEY(tag, 1), artists: [{ newName: `${tag} A` }] }],
      });
      return [done.err, await state(tag)];
    });
    expect(out[0]).toEqual({ code: "FORBIDDEN", message: "Only label members can publish releases." });
  });
});

describe("updateRelease vs update_release", () => {
  it("saves an album draft: order, titles, artists, album title and artists; removed tracks go last in their order", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await makeAlbum(tag, 4);
      await removeTrack(a.trackIds[1]);
      await removeTrack(a.trackIds[3]);
      const done = await via.update(a.releaseId, {
        album: { title: ` ${tag} Renamed `, artists: [{ newName: `${tag} New Band` }] },
        tracks: draftOf(tag, [a.trackIds[2], a.trackIds[0]]),
      });
      return [done.err, await state(tag)];
    });
    expect(out[1]).toMatchObject({
      tracks: [
        { title: "TAG Edited 2", position: 2, artists: ["TAG Editor"] },
        { title: "TAG-T2", position: 3, archived: true },
        { title: "TAG Edited 1", position: 1, artists: ["TAG Editor"] },
        { title: "TAG-T4", position: 4, archived: true },
      ],
      albums: [{ title: "TAG Renamed", artists: ["TAG New Band"] }],
    });
  });

  it("saves a single draft (title and artists)", async () => {
    await both("label_member", async (via, tag) => {
      const s = await makeSingle(tag);
      const done = await via.update(s.releaseId, {
        tracks: [{ id: s.trackId, title: `${tag} Retitled`, artists: [{ newName: `${tag} X` }, { newName: `${tag} Y` }] }],
      });
      return [done.err, await state(tag)];
    });
  });

  it("keeps a new artist's spelling from the first track when the album types it in another case", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await makeAlbum(tag, 2);
      const done = await via.update(a.releaseId, {
        album: { title: `${tag} LP`, artists: [{ newName: `${tag} DJ NOVA` }] },
        tracks: draftOf(tag, a.trackIds).map((t) => ({ ...t, artists: [{ newName: `${tag} dj nova` }] })),
      });
      return [done.err, await state(tag)];
    });
    expect(out[1]).toMatchObject({ albums: [{ artists: ["TAG dj nova"] }] });
  });

  it("clears the album artists when the draft lists none", async () => {
    await both("label_member", async (via, tag) => {
      const a = await makeAlbum(tag, 2);
      await admin.from("album_artists").insert({ album_id: a.albumId, artist_id: await makeArtist(`${tag} Old Band`), position: 1 });
      const done = await via.update(a.releaseId, { album: { title: `${tag} LP`, artists: [] }, tracks: draftOf(tag, a.trackIds) });
      return [done.err, await state(tag)];
    });
  });

  it("accepts the draft's ids in upper case", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await makeAlbum(tag, 2);
      const done = await via.update(a.releaseId, {
        album: { title: `${tag} LP`, artists: [] },
        tracks: draftOf(tag, a.trackIds).map((t) => ({ ...t, id: t.id.toUpperCase() })),
      });
      return [done.err, await state(tag)];
    });
    expect(out[0]).toBeNull();
  });

  it("reports an unknown release", async () => {
    const out = await both("label_member", async (via) => (await via.update(UNKNOWN, { tracks: [] })).err);
    expect(out).toEqual({ code: "NOT_FOUND", message: "Release not found." });
  });

  it.each([
    ["an archived release", { code: "INVALID", message: "Restore this release before editing it." }],
    ["a single with album details", { code: "INVALID", message: "A single has no album details." }],
    ["an album with a blank title", { code: "INVALID", message: "Album title is required." }],
  ])("refuses %s and changes nothing", async (what, expected) => {
    const out = await both("label_member", async (via, tag) => {
      // Separate tags inside this run's tag: both fixtures name an artist <tag>-A1.
      const s = await makeSingle(`${tag}s`);
      const a = await makeAlbum(`${tag}a`, 2);
      let done: Done;
      if (what === "an archived release") {
        await archiveRelease(s.releaseId);
        done = await via.update(s.releaseId, { tracks: draftOf(tag, [s.trackId]) });
      } else if (what === "a single with album details") {
        done = await via.update(s.releaseId, { album: { title: "x", artists: [] }, tracks: draftOf(tag, [s.trackId]) });
      } else {
        done = await via.update(a.releaseId, { album: { title: " ", artists: [] }, tracks: draftOf(tag, a.trackIds) });
      }
      return [done.err, await state(tag)];
    });
    expect(out[0]).toEqual(expected);
  });

  it.each([
    ["a live track missing", (ids: string[]) => ids.slice(1)],
    ["an extra unknown track", (ids: string[]) => [...ids, UNKNOWN]],
    ["a track listed twice", (ids: string[]) => [ids[0], ids[0], ids[1]]],
    ["a removed track listed", (ids: string[]) => ids],
    ["a live track swapped for an unknown one (same length)", (ids: string[]) => [ids[0], UNKNOWN]],
    ["a live track listed twice (same length)", (ids: string[]) => [ids[0], ids[0]]],
  ])("refuses a stale draft (%s) and changes nothing", async (_what, pick) => {
    const out = await both("label_member", async (via, tag) => {
      const a = await makeAlbum(tag, 3);
      await removeTrack(a.trackIds[2]);
      const ids = pick(a.trackIds.slice(0, 2)).concat(_what === "a removed track listed" ? [a.trackIds[2]] : []);
      const done = await via.update(a.releaseId, { album: { title: `${tag} LP`, artists: [] }, tracks: draftOf(tag, ids) });
      return [done.err, await state(tag)];
    });
    expect(out[0]).toEqual({ code: "INVALID", message: "This release changed since you opened it. Reload the page." });
  });

  it.each([
    ["a blank title on track 2", { title: "  " }, { code: "INVALID", message: "Track 2 needs a title." }],
    ["no artists on track 2", { artists: [] }, { code: "INVALID", message: "Track 2 needs at least one artist." }],
    ["an unknown artist on track 2", { artists: [{ id: UNKNOWN }] }, { code: "INVALID", message: "Unknown artist." }],
  ])("refuses %s after track 1 was saved, and keeps nothing", async (_what, change, expected) => {
    const out = await both("label_member", async (via, tag) => {
      const a = await makeAlbum(tag, 2);
      const [one, two] = draftOf(tag, a.trackIds);
      const done = await via.update(a.releaseId, { album: { title: `${tag} LP`, artists: [] }, tracks: [one, { ...two, ...change }] });
      return [done.err, await state(tag)];
    });
    expect(out[0]).toEqual(expected);
  });

  it.each(["listener", "artist"] as const)("refuses the %s role and changes nothing", async (role) => {
    const out = await both(role, async (via, tag) => {
      const s = await makeSingle(tag);
      const done = await via.update(s.releaseId, { tracks: draftOf(tag, [s.trackId]) });
      return [done.err, await state(tag)];
    });
    expect(out[0]).toEqual({ code: "FORBIDDEN", message: "Only label members can edit releases." });
  });
});

describe("addAlbumTrack vs add_album_track", () => {
  it("adds a track after every track, live or removed, and returns its id", async () => {
    const out = await both("label_member", async (via, tag) => {
      const a = await makeAlbum(tag, 3);
      await removeTrack(a.trackIds[2]);
      const done = await via.add(a.releaseId, {
        title: ` ${tag} Bonus `,
        audioKey: KEY(tag, 9),
        artists: [{ newName: `${tag} Guest` }, { newName: `${tag} Guest` }],
      });
      return [done.err, await state(tag, done.id)];
    });
    expect(out[1]).toMatchObject({
      returned: "TAG Bonus",
      tracks: [{ position: 1 }, { position: 2 }, { position: 3, archived: true }, { title: "TAG Bonus", position: 4, artists: ["TAG Guest"] }],
    });
  });

  it("reports an unknown release", async () => {
    const out = await both("label_member", async (via, tag) => (await via.add(UNKNOWN, { title: tag, audioKey: KEY(tag, 1), artists: [] })).err);
    expect(out).toEqual({ code: "NOT_FOUND", message: "Release not found." });
  });

  it.each([
    ["a single", { code: "INVALID", message: "Tracks can only be added to albums." }],
    ["an archived album", { code: "INVALID", message: "This album is archived." }],
    ["a blank title", { code: "INVALID", message: "Track needs a title." }],
    ["no artists", { code: "INVALID", message: "Track needs at least one artist." }],
  ])("refuses %s and adds nothing", async (what, expected) => {
    const out = await both("label_member", async (via, tag) => {
      // Separate tags inside this run's tag: both fixtures name an artist <tag>-A1.
      const s = await makeSingle(`${tag}s`);
      const a = await makeAlbum(`${tag}a`, 2);
      const track: AddTrackPayload = { title: `${tag} New`, audioKey: KEY(tag, 9), artists: [{ newName: `${tag} N` }] };
      let target = a.releaseId;
      if (what === "a single") target = s.releaseId;
      if (what === "an archived album") await archiveRelease(a.releaseId);
      if (what === "a blank title") track.title = "   ";
      if (what === "no artists") track.artists = [];
      const done = await via.add(target, track);
      return [done.err, await state(tag)];
    });
    expect(out[0]).toEqual(expected);
  });

  it.each(["listener", "artist"] as const)("refuses the %s role and adds nothing", async (role) => {
    const out = await both(role, async (via, tag) => {
      const a = await makeAlbum(tag, 2);
      const done = await via.add(a.releaseId, { title: `${tag} New`, audioKey: KEY(tag, 9), artists: [{ newName: `${tag} N` }] });
      return [done.err, await state(tag)];
    });
    expect(out[0]).toEqual({ code: "FORBIDDEN", message: "Only label members can add tracks." });
  });
});
