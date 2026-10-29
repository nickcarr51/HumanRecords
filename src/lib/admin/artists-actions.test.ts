import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseError, DomainError } from "@/lib/services/errors";

const getCurrentRole = vi.fn();
const getUser = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` });
});
const getCreditCounts = vi.fn();
const loadLinkTargets = vi.fn();

const insertSingle = vi.fn();
const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));
const updateSelect = vi.fn();
const updateEq = vi.fn(() => ({ select: updateSelect }));
const update = vi.fn(() => ({ eq: updateEq }));
const removeArtist = vi.fn();
const VIEWER = { userId: "u1", role: "label_member" };
const db = { from: () => ({ insert, update }), auth: { getUser: () => getUser() } };

vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
vi.mock("@/lib/services/viewer", () => ({ getViewer: async () => VIEWER }));
vi.mock("@/lib/services/artists", () => ({ removeArtist: (...a: unknown[]) => removeArtist(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("./artists", async (orig) => ({
  ...(await orig<typeof import("./artists")>()),
  getCreditCounts: (...a: unknown[]) => getCreditCounts(...a),
  loadLinkTargets: (...a: unknown[]) => loadLinkTargets(...a),
}));

import { createArtist, deleteArtist, searchLinkableUsers, updateArtist } from "./artists-actions";

const A = "33333333-3333-4333-8333-333333333333";
const U = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRole.mockResolvedValue("label_member");
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  insertSingle.mockResolvedValue({ data: { id: A }, error: null });
  updateSelect.mockResolvedValue({ data: [{ id: A }], error: null });
  removeArtist.mockResolvedValue(undefined);
  getCreditCounts.mockResolvedValue({ tracks: 2, albums: 1 });
  loadLinkTargets.mockResolvedValue({ users: [{ id: U, name: "Ada", email: "ada@x.co" }], links: [] });
});

describe("auth gate", () => {
  it("refuses every action for non-label-members without touching the DB", async () => {
    getCurrentRole.mockResolvedValue("artist");
    expect((await createArtist({ name: "X", bio: "", userId: null })).error).toBe("Only label members can do this.");
    expect((await updateArtist(A, { name: "X", bio: "", userId: null })).error).toBe("Only label members can do this.");
    expect((await deleteArtist(A)).error).toBe("Only label members can do this.");
    expect((await searchLinkableUsers("ada")).error).toBe("Only label members can do this.");
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(removeArtist).not.toHaveBeenCalled();
  });
});

describe("banned caller", () => {
  it("is refused even though the stale token still has the label_member role", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { code: "user_banned" } });
    expect((await createArtist({ name: "X", bio: "", userId: null })).error).toBe("Only label members can do this.");
    expect((await deleteArtist(A)).error).toBe("Only label members can do this.");
    expect(insert).not.toHaveBeenCalled();
    expect(removeArtist).not.toHaveBeenCalled();
  });
});

describe("createArtist", () => {
  it("validates input", async () => {
    expect((await createArtist({ name: "   ", bio: "", userId: null })).error).toBe("Enter a name.");
    expect((await createArtist({ name: "x".repeat(101), bio: "", userId: null })).error).toMatch(/100 characters/);
    expect((await createArtist({ name: "X", bio: "b".repeat(2001), userId: null })).error).toMatch(/2000 characters/);
    expect((await createArtist({ name: "X", bio: "", userId: "nope" })).error).toBe("Pick a user from the list.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts trimmed values, revalidates, and redirects to the edit page", async () => {
    await expect(createArtist({ name: "  Halcyon ", bio: "  ", userId: U })).rejects.toThrow("NEXT_REDIRECT");
    expect(insert).toHaveBeenCalledWith({ name: "Halcyon", bio: null, user_id: U });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/artists");
    expect(revalidatePath).toHaveBeenCalledWith("/feed");
    expect(redirect).toHaveBeenCalledWith(`/admin/artists/${A}`);
  });

  it("maps duplicate name and duplicate linked user", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "23505", message: 'violates unique constraint "artists_name_ci_key"' } });
    expect((await createArtist({ name: "Halcyon", bio: "", userId: null })).error).toBe('An artist named "Halcyon" already exists.');
    insertSingle.mockResolvedValue({ data: null, error: { code: "23505", message: 'violates unique constraint "artists_user_id_key"' } });
    expect((await createArtist({ name: "New", bio: "", userId: U })).error).toBe("That user is already linked to another artist.");
  });

  it("maps a linked user deleted meanwhile (FK violation)", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "23503", message: "artists_user_id_fkey" } });
    expect((await createArtist({ name: "X", bio: "", userId: U })).error).toBe("That user no longer exists. Pick another.");
  });

  it("maps RLS refusal and unknown errors", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "42501", message: "row-level security" } });
    expect((await createArtist({ name: "X", bio: "", userId: null })).error).toBe("Only label members can do this.");
    insertSingle.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect((await createArtist({ name: "X", bio: "", userId: null })).error).toBe("Couldn't save. Try again.");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("updateArtist", () => {
  it("rejects a malformed id", async () => {
    expect((await updateArtist("nope", { name: "X", bio: "", userId: null })).error).toBe("That artist no longer exists.");
  });

  it("maps a linked user deleted meanwhile (FK violation)", async () => {
    updateSelect.mockResolvedValue({ data: null, error: { code: "23503", message: "artists_user_id_fkey" } });
    expect((await updateArtist(A, { name: "X", bio: "", userId: U })).error).toBe("That user no longer exists. Pick another.");
  });

  it("updates, unlinks with null, and revalidates list, page and feed", async () => {
    expect((await updateArtist(A, { name: "Renamed", bio: "Bio", userId: null })).error).toBeNull();
    expect(update).toHaveBeenCalledWith({ name: "Renamed", bio: "Bio", user_id: null });
    expect(updateEq).toHaveBeenCalledWith("id", A);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/artists");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/artists/${A}`);
    expect(revalidatePath).toHaveBeenCalledWith("/feed");
  });

  it("reports a vanished artist (0 rows updated)", async () => {
    updateSelect.mockResolvedValue({ data: [], error: null });
    expect((await updateArtist(A, { name: "X", bio: "", userId: null })).error).toBe("That artist no longer exists.");
  });

  it("maps a duplicate name", async () => {
    updateSelect.mockResolvedValue({ data: null, error: { code: "23505", message: 'violates unique constraint "artists_name_ci_key"' } });
    expect((await updateArtist(A, { name: "Taken", bio: "", userId: null })).error).toBe('An artist named "Taken" already exists.');
  });
});

describe("deleteArtist", () => {
  it("calls removeArtist and redirects to the list", async () => {
    await expect(deleteArtist(A)).rejects.toThrow("NEXT_REDIRECT");
    expect(removeArtist).toHaveBeenCalledWith(VIEWER, A);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/artists");
    expect(redirect).toHaveBeenCalledWith("/admin/artists");
  });

  it("maps 23503 to the credit message with live counts", async () => {
    removeArtist.mockRejectedValue(new DomainError("CONFLICT", "That item is still in use."));
    expect((await deleteArtist(A)).error).toBe(
      "This artist is credited on 2 tracks / 1 album. Remove those credits first.",
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it("maps P0002, 42501 and unknown errors", async () => {
    removeArtist.mockRejectedValue(new DomainError("NOT_FOUND", "Artist not found."));
    expect((await deleteArtist(A)).error).toBe("That artist no longer exists.");
    removeArtist.mockRejectedValue(new DomainError("FORBIDDEN", "Only label members can delete artists."));
    expect((await deleteArtist(A)).error).toBe("Only label members can do this.");
    removeArtist.mockRejectedValue(new DatabaseError("XX000", undefined));
    expect((await deleteArtist(A)).error).toBe("Couldn't delete. Try again.");
  });
});

describe("searchLinkableUsers", () => {
  it("returns matches, empty for blank queries, and an error when loading fails", async () => {
    expect((await searchLinkableUsers("ada", A)).users.map((u) => u.id)).toEqual([U]);
    expect((await searchLinkableUsers("  ")).users).toEqual([]);
    loadLinkTargets.mockRejectedValue(new Error("boom"));
    expect(await searchLinkableUsers("ada")).toEqual({ users: [], error: "Search failed." });
  });
});
