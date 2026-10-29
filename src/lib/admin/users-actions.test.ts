import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseError, DomainError } from "@/lib/services/errors";

const getCurrentRole = vi.fn();
const getUser = vi.fn();
const createUserApi = vi.fn();
const changeUserRole = vi.fn();
const VIEWER = { userId: "11111111-1111-1111-1111-111111111111", role: "label_member" };
const upsertInvite = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
const getUserById = vi.fn();
const updateUserById = vi.fn();
const usersEq = vi.fn();
const usersUpdate = vi.fn(() => ({ eq: usersEq }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: { admin: { createUser: createUserApi, getUserById, updateUserById } },
    from: () => ({ update: usersUpdate }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: () => getUser() } }) }));
vi.mock("@/lib/services/viewer", () => ({ getViewer: async () => VIEWER }));
vi.mock("@/lib/services/users", () => ({ changeUserRole: (...a: unknown[]) => changeUserRole(...a) }));
vi.mock("@/lib/invites/store", () => ({ upsertInvite: (...a: unknown[]) => upsertInvite(...a) }));
vi.mock("@/lib/invites/token", () => ({ generateInviteToken: () => "T".repeat(43) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { createUser, issueInvite, setUserActive, setUserRole, updateUserProfile } from "./users-actions";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRole.mockResolvedValue("label_member");
  getUser.mockResolvedValue({ data: { user: { id: ME } }, error: null });
  createUserApi.mockResolvedValue({ data: { user: { id: OTHER } }, error: null });
  upsertInvite.mockResolvedValue(undefined);
  changeUserRole.mockResolvedValue(undefined);
  getUserById.mockResolvedValue({ data: { user: { id: OTHER, email: "old@x.co" } }, error: null });
  updateUserById.mockResolvedValue({ data: { user: {} }, error: null });
  usersEq.mockResolvedValue({ error: null });
});

describe("banned caller", () => {
  it("is refused by every action even though the stale token still has the label_member role", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { code: "user_banned" } });
    const forbidden = /label members/i;
    expect((await createUser({ email: "a@b.co", name: "", role: "listener" })).error).toMatch(forbidden);
    expect((await issueInvite(OTHER)).error).toMatch(forbidden);
    expect((await setUserRole(OTHER, "artist")).error).toMatch(forbidden);
    expect((await updateUserProfile(OTHER, { name: "A", email: "a@b.co" })).error).toMatch(forbidden);
    expect((await setUserActive(OTHER, true)).error).toMatch(forbidden);
    expect(createUserApi).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(changeUserRole).not.toHaveBeenCalled();
  });
});

describe("createUser", () => {
  it("refuses non-label-members without touching Supabase", async () => {
    getCurrentRole.mockResolvedValue("listener");
    const res = await createUser({ email: "a@b.co", name: "", role: "listener" });
    expect(res.error).toMatch(/label members/i);
    expect(createUserApi).not.toHaveBeenCalled();
  });

  it("normalizes email, sets role in app_metadata, name in user_metadata, and issues an invite", async () => {
    const res = await createUser({ email: "  Guest@Example.COM ", name: "  Guest  ", role: "artist" });
    expect(res.error).toBeNull();
    expect(createUserApi).toHaveBeenCalledWith({
      email: "guest@example.com",
      email_confirm: true,
      app_metadata: { role: "artist" },
      user_metadata: { name: "Guest" },
    });
    expect(upsertInvite).toHaveBeenCalledWith(expect.anything(), {
      userId: OTHER,
      token: "T".repeat(43),
      createdBy: ME,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("rejects a bad email", async () => {
    const res = await createUser({ email: "not-an-email", name: "", role: "listener" });
    expect(res.error).toBe("Enter a valid email.");
    expect(createUserApi).not.toHaveBeenCalled();
  });

  it("rejects forged input: unknown role or non-string email", async () => {
    expect((await createUser({ email: "a@b.co", name: "", role: "superuser" as never })).error).toBe("Pick a role.");
    expect((await createUser({ email: 42 as never, name: "", role: "listener" })).error).toBe("Enter a valid email.");
    expect(createUserApi).not.toHaveBeenCalled();
  });

  it("maps a duplicate email to friendly copy", async () => {
    createUserApi.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });
    const res = await createUser({ email: "a@b.co", name: "", role: "listener" });
    expect(res.error).toBe("That email already has an account — use its row in the table.");
    expect(upsertInvite).not.toHaveBeenCalled();
  });

  it("soft-errors when the account is created but the invite insert fails", async () => {
    upsertInvite.mockRejectedValue(new Error("boom"));
    const res = await createUser({ email: "a@b.co", name: "", role: "listener" });
    expect(res.error).toMatch(/account created/i);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });
});

describe("issueInvite", () => {
  it("refuses non-label-members", async () => {
    getCurrentRole.mockResolvedValue("artist");
    expect((await issueInvite(OTHER)).error).toMatch(/label members/i);
    expect(upsertInvite).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid id", async () => {
    expect((await issueInvite("nope")).error).toBe("Unknown user.");
    expect(upsertInvite).not.toHaveBeenCalled();
  });

  it("upserts a fresh token", async () => {
    expect((await issueInvite(OTHER)).error).toBeNull();
    expect(upsertInvite).toHaveBeenCalledWith(expect.anything(), {
      userId: OTHER,
      token: "T".repeat(43),
      createdBy: ME,
    });
  });

  it("reports a failed upsert", async () => {
    upsertInvite.mockRejectedValue(new Error("fk"));
    expect((await issueInvite(OTHER)).error).toBe("Couldn't create the link. Try again.");
  });
});

describe("setUserRole", () => {
  it("refuses your own id without calling the database", async () => {
    expect((await setUserRole(ME, "listener")).error).toBe("You can't change your own role.");
    expect(changeUserRole).not.toHaveBeenCalled();
  });

  it("rejects an unknown role", async () => {
    expect((await setUserRole(OTHER, "root" as never)).error).toBe("Pick a role.");
    expect(changeUserRole).not.toHaveBeenCalled();
  });

  it("calls changeUserRole", async () => {
    expect((await setUserRole(OTHER, "artist")).error).toBeNull();
    expect(changeUserRole).toHaveBeenCalledWith(VIEWER, OTHER, "artist");
  });

  it("maps database errors", async () => {
    changeUserRole.mockRejectedValue(new DomainError("NOT_FOUND", "User not found."));
    expect((await setUserRole(OTHER, "artist")).error).toBe("That user no longer exists.");
    changeUserRole.mockRejectedValue(new DomainError("FORBIDDEN", "Only label members can change roles."));
    expect((await setUserRole(OTHER, "artist")).error).toMatch(/label members/i);
  });

  it("maps the own-role refusal and unexpected failures", async () => {
    changeUserRole.mockRejectedValue(new DomainError("INVALID", "You can't change your own role."));
    expect((await setUserRole(OTHER, "artist")).error).toBe("You can't change your own role.");
    changeUserRole.mockRejectedValue(new DatabaseError("XX000", undefined));
    expect((await setUserRole(OTHER, "artist")).error).toBe("Couldn't save the role. Try again.");
  });
});

describe("updateUserProfile", () => {
  it("refuses non-label-members without touching Supabase", async () => {
    getCurrentRole.mockResolvedValue("artist");
    const res = await updateUserProfile(OTHER, { name: "A", email: "a@x.co" });
    expect(res.error).toMatch(/label members/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("rejects a bad email or id", async () => {
    expect((await updateUserProfile(OTHER, { name: "", email: "nope" })).error).toMatch(/valid email/i);
    expect((await updateUserProfile("x", { name: "", email: "a@x.co" })).error).toMatch(/unknown user/i);
  });

  it("changes email without a confirmation email and saves the name in both places", async () => {
    const res = await updateUserProfile(OTHER, { name: "  New Name ", email: " New@X.co " });
    expect(res.error).toBeNull();
    expect(updateUserById).toHaveBeenCalledWith(OTHER, {
      email: "new@x.co",
      email_confirm: true,
      user_metadata: { name: "New Name" },
    });
    expect(usersUpdate).toHaveBeenCalledWith({ name: "New Name" });
    expect(usersEq).toHaveBeenCalledWith("id", OTHER);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/users/${OTHER}`);
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });

  it("does not send the email when only the name (or email case) changed", async () => {
    await updateUserProfile(OTHER, { name: "", email: "OLD@x.co" });
    expect(updateUserById).toHaveBeenCalledWith(OTHER, { user_metadata: { name: null } });
    expect(usersUpdate).toHaveBeenCalledWith({ name: null });
  });

  it("allows editing yourself", async () => {
    getUserById.mockResolvedValue({ data: { user: { id: ME, email: "me@x.co" } }, error: null });
    expect((await updateUserProfile(ME, { name: "Me", email: "me2@x.co" })).error).toBeNull();
    // The nav name comes from the (app) layout, so editing yourself refreshes it.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("maps a duplicate email", async () => {
    updateUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });
    expect((await updateUserProfile(OTHER, { name: "", email: "taken@x.co" })).error).toBe(
      "That email already has an account.",
    );
    expect(usersUpdate).not.toHaveBeenCalled();
  });

  it("reports a missing user", async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: { message: "User not found" } });
    expect((await updateUserProfile(OTHER, { name: "", email: "a@x.co" })).error).toBe(
      "That user no longer exists.",
    );
  });

  it("reports a partial failure when the name save fails after the auth save", async () => {
    usersEq.mockResolvedValue({ error: { message: "boom" } });
    expect((await updateUserProfile(OTHER, { name: "N", email: "new@x.co" })).error).toBe(
      "Email saved, but the name didn't. Try again.",
    );
  });
});

describe("setUserActive", () => {
  it("refuses non-label-members", async () => {
    getCurrentRole.mockResolvedValue("listener");
    expect((await setUserActive(OTHER, false)).error).toMatch(/label members/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("blocks deactivating yourself", async () => {
    expect((await setUserActive(ME, false)).error).toBe("You can't deactivate yourself.");
    expect((await setUserActive(ME, true)).error).toBe("You can't reactivate yourself.");
    expect(updateUserById).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("bans for 100 years to deactivate and lifts it to reactivate", async () => {
    expect((await setUserActive(OTHER, false)).error).toBeNull();
    expect(updateUserById).toHaveBeenCalledWith(OTHER, { ban_duration: "876000h" });
    expect((await setUserActive(OTHER, true)).error).toBeNull();
    expect(updateUserById).toHaveBeenCalledWith(OTHER, { ban_duration: "none" });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/users/${OTHER}`);
  });

  it("maps a missing user and generic failures", async () => {
    updateUserById.mockResolvedValue({ data: { user: null }, error: { message: "User not found" } });
    expect((await setUserActive(OTHER, false)).error).toBe("That user no longer exists.");
    updateUserById.mockResolvedValue({ data: { user: null }, error: { message: "boom" } });
    expect((await setUserActive(OTHER, false)).error).toBe("Couldn't save. Try again.");
  });
});
