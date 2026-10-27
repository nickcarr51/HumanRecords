import { describe, expect, it, vi } from "vitest";
import { getAdminUser, toAdminUserRow, type AdminListRow } from "./users";

const { listUsers, viewer } = vi.hoisted(() => ({
  listUsers: vi.fn(),
  viewer: { userId: "me", role: "label_member", claims: { sub: "me" } },
}));
vi.mock("@/lib/services/viewer", () => ({
  getViewer: async () => viewer,
}));
vi.mock("@/lib/services/users", () => ({ listUsers: (...a: unknown[]) => listUsers(...a) }));

const base = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada",
  role: "listener" as const,
  created_at: "2026-10-02T00:00:00Z",
  invite_token: null,
  invite_used_at: null,
  banned_until: null,
} as unknown as AdminListRow;
const SITE = "http://127.0.0.1:3000";

describe("toAdminUserRow", () => {
  it("no invite row → none", () => {
    expect(toAdminUserRow(base, SITE).invite).toEqual({ status: "none" });
  });

  it("token, not used → unused with URL", () => {
    const row = toAdminUserRow({ ...base, invite_token: "tok" }, SITE);
    expect(row.invite).toEqual({
      status: "unused",
      url: "http://127.0.0.1:3000/login?email=ada%40example.com&invite=tok",
    });
  });

  it("used_at set → used", () => {
    const row = toAdminUserRow({ ...base, invite_used_at: "2026-10-03T10:00:00Z" }, SITE);
    expect(row.invite).toEqual({ status: "used", usedAt: "2026-10-03T10:00:00Z" });
  });

  it("maps fields and null name", () => {
    expect(toAdminUserRow({ ...base, name: null } as unknown as AdminListRow, SITE)).toMatchObject({
      id: "u1",
      email: "ada@example.com",
      name: null,
      role: "listener",
      createdAt: "2026-10-02T00:00:00Z",
    });
  });

  it("throws when a token exists but SITE_URL is missing", () => {
    expect(() => toAdminUserRow({ ...base, invite_token: "tok" }, undefined)).toThrow(/SITE_URL/);
  });
});

describe("toAdminUserRow deactivated", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("no ban → active", () => {
    expect(toAdminUserRow(base, SITE, now).deactivated).toBe(false);
  });
  it("ban in the future → deactivated", () => {
    expect(toAdminUserRow({ ...base, banned_until: "2126-01-01T00:00:00Z" }, SITE, now).deactivated).toBe(true);
  });
  it("ban already expired → active", () => {
    expect(toAdminUserRow({ ...base, banned_until: "2026-10-09T00:00:00Z" }, SITE, now).deactivated).toBe(false);
  });
});

describe("getAdminUser", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const db = (rows: unknown[]) => {
    listUsers.mockResolvedValue(rows);
    return {} as unknown as Parameters<typeof getAdminUser>[0];
  };
  it("returns the matching row", async () => {
    const row = await getAdminUser(db([{ ...base, id: ID }]), SITE, ID);
    expect(row?.id).toBe(ID);
    expect(listUsers.mock.lastCall?.[0]).toBe(viewer);
  });
  it("returns null for an unknown or malformed id", async () => {
    expect(await getAdminUser(db([{ ...base, id: ID }]), SITE, "22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(await getAdminUser(db([]), SITE, "not-a-uuid")).toBeNull();
  });
});
