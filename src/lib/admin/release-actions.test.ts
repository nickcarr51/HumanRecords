import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseError, DomainError } from "@/lib/services/errors";

const getCurrentRole = vi.fn();
const rpc = vi.fn();
const svcSelect = vi.fn();
const svcIs = vi.fn<(c: string, v: unknown) => { select: typeof svcSelect }>(() => ({ select: svcSelect }));
const svcEq = vi.fn<(c: string, v: unknown) => { is: typeof svcIs }>(() => ({ is: svcIs }));
const svcUpdate = vi.fn<(v: unknown) => { eq: typeof svcEq }>(() => ({ eq: svcEq }));
const svcFrom = vi.fn<(t: string) => { update: typeof svcUpdate }>(() => ({ update: svcUpdate }));
const headObject = vi.fn();
const revalidatePath = vi.fn();
const VIEWER = { userId: "u1", role: "label_member" };
const getViewer = vi.fn();
const service = {
  moveRelease: vi.fn(),
  archiveRelease: vi.fn(),
  restoreRelease: vi.fn(),
  archiveTrack: vi.fn(),
  restoreTrack: vi.fn(),
  replaceTrackAudio: vi.fn(),
};

vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: svcFrom }) }));
vi.mock("@/lib/storage/sign", () => ({ headObject: (...a: [string]) => headObject(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/services/viewer", () => ({ getViewer: (...a: unknown[]) => getViewer(...a) }));
vi.mock("@/lib/services/releases", () => ({
  moveRelease: (...a: unknown[]) => service.moveRelease(...a),
  archiveRelease: (...a: unknown[]) => service.archiveRelease(...a),
  restoreRelease: (...a: unknown[]) => service.restoreRelease(...a),
  archiveTrack: (...a: unknown[]) => service.archiveTrack(...a),
  restoreTrack: (...a: unknown[]) => service.restoreTrack(...a),
  replaceTrackAudio: (...a: unknown[]) => service.replaceTrackAudio(...a),
}));

import {
  addAlbumTrack,
  archiveRelease,
  moveRelease,
  removeTrack,
  replaceTrackAudio,
  restoreRelease,
  restoreTrack,
  saveRelease,
  setPinned,
} from "./release-actions";
import type { ReleaseEditPayload } from "./types";

const ID = "0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f";
const FORBIDDEN = "Only label members can do this.";

function expectNoServiceCall() {
  for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRole.mockResolvedValue("label_member");
  rpc.mockResolvedValue({ data: null, error: null });
  getViewer.mockResolvedValue(VIEWER);
  svcSelect.mockResolvedValue({ data: [{ id: ID }], error: null });
});

describe("role gate", () => {
  it.each(["listener", "artist", null])("refuses role %s with no DB call", async (role) => {
    getCurrentRole.mockResolvedValue(role);
    for (const call of [
      () => setPinned(ID, true),
      () => moveRelease(ID, "up"),
      () => archiveRelease(ID),
      () => restoreRelease(ID),
      () => removeTrack(ID),
      () => restoreTrack(ID),
    ]) {
      expect(await call()).toEqual({ error: FORBIDDEN });
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(svcFrom).not.toHaveBeenCalled();
    expectNoServiceCall();
  });
});

describe("input checks", () => {
  it("refuses non-UUID ids and bad arguments without a DB call", async () => {
    expect(await setPinned("nope", true)).toEqual({ error: "Invalid request." });
    expect(await setPinned(ID, "yes" as unknown as boolean)).toEqual({ error: "Invalid request." });
    expect(await moveRelease(ID, "sideways" as "up")).toEqual({ error: "Invalid request." });
    expect(await archiveRelease("1; drop table")).toEqual({ error: "Invalid request." });
    expect(rpc).not.toHaveBeenCalled();
    expect(svcFrom).not.toHaveBeenCalled();
    expectNoServiceCall();
  });
});

describe("setPinned", () => {
  it("updates live releases via the service client and revalidates", async () => {
    expect(await setPinned(ID, true)).toEqual({ error: null });
    expect(svcFrom).toHaveBeenCalledWith("releases");
    expect(svcUpdate).toHaveBeenCalledWith({ pinned: true });
    expect(svcEq).toHaveBeenCalledWith("id", ID);
    expect(svcIs).toHaveBeenCalledWith("archived_at", null);
    expect(revalidatePath).toHaveBeenCalledWith("/feed");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/releases");
  });

  it("reports a missing/archived release and a DB error", async () => {
    svcSelect.mockResolvedValueOnce({ data: [], error: null });
    expect(await setPinned(ID, true)).toEqual({ error: "Release not found." });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    svcSelect.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await setPinned(ID, false)).toEqual({ error: "Couldn't save — try again." });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("service actions", () => {
  it.each([
    ["moveRelease", () => moveRelease(ID, "down"), "moveRelease", [ID, "down"]],
    ["archiveRelease", () => archiveRelease(ID), "archiveRelease", [ID]],
    ["restoreRelease", () => restoreRelease(ID), "restoreRelease", [ID]],
    ["removeTrack", () => removeTrack(ID), "archiveTrack", [ID]],
    ["restoreTrack", () => restoreTrack(ID), "restoreTrack", [ID]],
  ] as const)("%s calls %s and revalidates", async (_n, call, fn, args) => {
    expect(await call()).toEqual({ error: null });
    expect(service[fn]).toHaveBeenCalledWith(VIEWER, ...args);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/releases/[id]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/albums/[id]", "page");
  });

  it("maps FORBIDDEN, INVALID, NOT_FOUND, RETRY and unknown errors", async () => {
    service.archiveRelease.mockRejectedValueOnce(new DomainError("FORBIDDEN", "Only label members can archive releases."));
    expect(await archiveRelease(ID)).toEqual({ error: FORBIDDEN });
    service.restoreTrack.mockRejectedValueOnce(new DomainError("INVALID", "Restore the album first."));
    expect(await restoreTrack(ID)).toEqual({ error: "Restore the album first." });
    service.archiveTrack.mockRejectedValueOnce(new DomainError("NOT_FOUND", "Track not found."));
    expect(await removeTrack(ID)).toEqual({ error: "Track not found." });
    service.moveRelease.mockRejectedValueOnce(new DomainError("RETRY", "The database was busy; please try again."));
    expect(await moveRelease(ID, "up")).toEqual({ error: "Couldn't reorder — try again" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    service.restoreRelease.mockRejectedValueOnce(new DatabaseError("XX000", undefined));
    expect(await restoreRelease(ID)).toEqual({ error: "Couldn't save — try again." });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("gives the logged fallback for RETRY outside moveRelease, as for a deadlock today", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      service.archiveRelease.mockRejectedValueOnce(new DomainError("RETRY", "The database was busy; please try again."));
      expect(await archiveRelease(ID)).toEqual({ error: "Couldn't save — try again." });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("gives the logged fallback when getViewer throws, without calling the service", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getViewer.mockRejectedValueOnce(new DomainError("UNAUTHENTICATED", "Sign in to continue."));
      expect(await removeTrack(ID)).toEqual({ error: "Couldn't save — try again." });
      expectNoServiceCall();
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

const KEY = "tracks/1b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f.mp3";
const draft: ReleaseEditPayload = { tracks: [{ id: ID, title: "Song", artists: [{ newName: "Nova" }] }] };

describe("content actions: role gate", () => {
  it("refuses non-label-members with no DB or storage call", async () => {
    getCurrentRole.mockResolvedValue("listener");
    expect(await saveRelease(ID, draft)).toEqual({ error: FORBIDDEN });
    expect(await addAlbumTrack(ID, { title: "t", audioKey: KEY, artists: [{ newName: "N" }] })).toEqual({ error: FORBIDDEN });
    expect(await replaceTrackAudio(ID, KEY)).toEqual({ error: FORBIDDEN });
    expect(rpc).not.toHaveBeenCalled();
    expectNoServiceCall();
    expect(headObject).not.toHaveBeenCalled();
  });
});

describe("saveRelease", () => {
  it("calls update_release with the draft", async () => {
    expect(await saveRelease(ID, draft)).toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith("update_release", { p_release_id: ID, payload: draft });
  });

  it("refuses malformed drafts without a DB call", async () => {
    expect(await saveRelease(ID, {} as ReleaseEditPayload)).toEqual({ error: "Invalid request." });
    expect(await saveRelease(ID, { tracks: [{ id: "x", title: "t", artists: [] }] })).toEqual({ error: "Invalid request." });
    const many = { tracks: Array.from({ length: 51 }, () => draft.tracks[0]) };
    expect(await saveRelease(ID, many)).toEqual({ error: "Too many tracks." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses malformed artist id refs (album and track) but lets newName through", async () => {
    const bad = { id: "not-a-uuid" };
    expect(await saveRelease(ID, { album: { title: "A", artists: [bad] }, tracks: draft.tracks })).toEqual({ error: "Invalid request." });
    expect(await saveRelease(ID, { tracks: [{ id: ID, title: "t", artists: [bad] }] })).toEqual({ error: "Invalid request." });
    expect(rpc).not.toHaveBeenCalled();
    const ok = { album: { title: "A", artists: [{ id: ID }, { newName: "Nova" }] }, tracks: [{ id: ID, title: "t", artists: [{ id: ID }] }] };
    expect(await saveRelease(ID, ok)).toEqual({ error: null });
  });

  it("refuses artist refs with neither a uuid id nor a non-blank newName", async () => {
    for (const bad of [{}, { newName: 123 }, { newName: "  " }, null]) {
      expect(await saveRelease(ID, { tracks: [{ id: ID, title: "t", artists: [bad] }] } as unknown as ReleaseEditPayload)).toEqual({ error: "Invalid request." });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the stale-draft message through", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "22023", message: "This release changed since you opened it. Reload the page." } });
    expect(await saveRelease(ID, draft)).toEqual({ error: "This release changed since you opened it. Reload the page." });
  });
});

describe("addAlbumTrack / replaceTrackAudio", () => {
  const add = { title: "New", audioKey: KEY, artists: [{ newName: "Nova" }] };

  it("verifies the upload, then calls the function", async () => {
    headObject.mockResolvedValue({ size: 100 });
    expect(await addAlbumTrack(ID, add)).toEqual({ error: null });
    expect(headObject).toHaveBeenCalledWith(KEY);
    expect(rpc).toHaveBeenCalledWith("add_album_track", { p_release_id: ID, payload: add });
    expect(await replaceTrackAudio(ID, KEY)).toEqual({ error: null });
    expect(service.replaceTrackAudio).toHaveBeenCalledWith(VIEWER, ID, KEY);
  });

  it("refuses a key that wasn't minted by createUploadUrls", async () => {
    expect(await replaceTrackAudio(ID, "tracks/../secret.mp3")).toEqual({ error: "Invalid audio file reference." });
    expect(await addAlbumTrack(ID, { ...add, audioKey: "x.mp3" })).toEqual({ error: "Invalid audio file reference." });
    expect(headObject).not.toHaveBeenCalled();
  });

  it("refuses malformed artist id refs in addAlbumTrack without storage or DB calls", async () => {
    expect(await addAlbumTrack(ID, { ...add, artists: [{ id: "nope" }] })).toEqual({ error: "Invalid request." });
    expect(headObject).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses artist refs with neither a uuid id nor a non-blank newName in addAlbumTrack", async () => {
    for (const bad of [{}, { newName: 123 }, { newName: "  " }]) {
      expect(await addAlbumTrack(ID, { ...add, artists: [bad] } as never)).toEqual({ error: "Invalid request." });
    }
    expect(headObject).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports missing, oversized, and unverifiable uploads without calling the DB", async () => {
    headObject.mockResolvedValueOnce(null);
    expect(await replaceTrackAudio(ID, KEY)).toEqual({ error: "The file didn't finish uploading. Try again." });
    headObject.mockResolvedValueOnce({ size: 60 * 1024 * 1024 });
    expect(await replaceTrackAudio(ID, KEY)).toEqual({ error: "MP3s must be 50 MB or smaller." });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    headObject.mockRejectedValueOnce(new Error("network"));
    expect(await addAlbumTrack(ID, add)).toEqual({ error: "Couldn't verify the uploaded file. Try again." });
    spy.mockRestore();
    expect(rpc).not.toHaveBeenCalled();
    expectNoServiceCall();
  });
});
