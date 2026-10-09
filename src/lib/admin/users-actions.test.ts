import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentRole = vi.fn();
const getSessionUser = vi.fn();
const createUserApi = vi.fn();
const rpc = vi.fn();
const upsertInvite = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { createUser: createUserApi } } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/invites/store", () => ({ upsertInvite: (...a: unknown[]) => upsertInvite(...a) }));
vi.mock("@/lib/invites/token", () => ({ generateInviteToken: () => "T".repeat(43) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { createUser, issueInvite, setUserRole } from "./users-actions";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRole.mockResolvedValue("label_member");
  getSessionUser.mockResolvedValue({ sub: ME });
  createUserApi.mockResolvedValue({ data: { user: { id: OTHER } }, error: null });
  upsertInvite.mockResolvedValue(undefined);
  rpc.mockResolvedValue({ error: null });
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
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an unknown role", async () => {
    expect((await setUserRole(OTHER, "root" as never)).error).toBe("Pick a role.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls admin_set_user_role", async () => {
    expect((await setUserRole(OTHER, "artist")).error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("admin_set_user_role", { target: OTHER, new_role: "artist" });
  });

  it("maps database errors", async () => {
    rpc.mockResolvedValue({ error: { code: "P0002", message: "User not found." } });
    expect((await setUserRole(OTHER, "artist")).error).toBe("That user no longer exists.");
    rpc.mockResolvedValue({ error: { code: "42501", message: "x" } });
    expect((await setUserRole(OTHER, "artist")).error).toMatch(/label members/i);
  });
});
