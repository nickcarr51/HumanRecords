import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentRole = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("@/lib/auth/role", () => ({ getCurrentRole: () => getCurrentRole() }));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import AdminLayout from "./layout";

beforeEach(() => vi.clearAllMocks());

describe("AdminLayout", () => {
  it.each(["listener", "artist", null])("404s for role %s", async (role) => {
    getCurrentRole.mockResolvedValue(role);
    await expect(AdminLayout({ children: "secret" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders children for label members", async () => {
    getCurrentRole.mockResolvedValue("label_member");
    expect(await AdminLayout({ children: "secret" })).toBe("secret");
  });
});
