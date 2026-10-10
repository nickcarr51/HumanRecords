import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentRole = vi.fn();
const rpc = vi.fn();
const svcSelect = vi.fn();
const svcIs = vi.fn((_c?: string, _v?: unknown) => ({ select: svcSelect }));
const svcEq = vi.fn((_c?: string, _v?: unknown) => ({ is: svcIs }));
const svcUpdate = vi.fn((_v?: unknown) => ({ eq: svcEq }));
const svcFrom = vi.fn((_t?: string) => ({ update: svcUpdate }));
const headObject = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: svcFrom }) }));
vi.mock("@/lib/storage/sign", () => ({ headObject: (...a: [string]) => headObject(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { archiveRelease, moveRelease, removeTrack, restoreRelease, restoreTrack, setPinned } from "./release-actions";

const ID = "0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f";
const FORBIDDEN = "Only label members can do this.";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRole.mockResolvedValue("label_member");
  rpc.mockResolvedValue({ data: null, error: null });
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
    spy.mockRestore();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("rpc actions", () => {
  it.each([
    ["moveRelease", () => moveRelease(ID, "down"), "move_release", { target: ID, direction: "down" }],
    ["archiveRelease", () => archiveRelease(ID), "archive_release", { p_release_id: ID }],
    ["restoreRelease", () => restoreRelease(ID), "restore_release", { p_release_id: ID }],
    ["removeTrack", () => removeTrack(ID), "archive_track", { p_track_id: ID }],
    ["restoreTrack", () => restoreTrack(ID), "restore_track", { p_track_id: ID }],
  ] as const)("%s calls %s and revalidates", async (_n, call, fn, args) => {
    expect(await call()).toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith(fn, args);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/releases/[id]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/albums/[id]", "page");
  });

  it("maps 42501, 22023, P0002, 40P01 and unknown errors", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "42501", message: "x" } });
    expect(await archiveRelease(ID)).toEqual({ error: FORBIDDEN });
    rpc.mockResolvedValueOnce({ error: { code: "22023", message: "Restore the album first." } });
    expect(await restoreTrack(ID)).toEqual({ error: "Restore the album first." });
    rpc.mockResolvedValueOnce({ error: { code: "P0002", message: "Track not found." } });
    expect(await removeTrack(ID)).toEqual({ error: "Track not found." });
    rpc.mockResolvedValueOnce({ error: { code: "40P01", message: "deadlock detected" } });
    expect(await moveRelease(ID, "up")).toEqual({ error: "Couldn't reorder — try again" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "boom" } });
    expect(await restoreRelease(ID)).toEqual({ error: "Couldn't save — try again." });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
