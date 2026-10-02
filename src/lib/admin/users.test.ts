import { describe, expect, it } from "vitest";
import { toAdminUserRow, type AdminListRow } from "./users";

const base = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada",
  role: "listener" as const,
  created_at: "2026-10-02T00:00:00Z",
  invite_token: null,
  invite_used_at: null,
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
