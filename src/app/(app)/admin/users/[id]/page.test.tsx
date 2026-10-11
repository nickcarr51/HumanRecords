import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

const requireLabelMember = vi.fn();
const getAdminUser = vi.fn();
const getSessionUser = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("@/lib/auth/role", () => ({ requireLabelMember: () => requireLabelMember() }));
vi.mock("@/lib/admin/users", () => ({ getAdminUser: (...a: unknown[]) => getAdminUser(...a) }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/lib/admin/users-actions", () => ({
  createUser: vi.fn(), issueInvite: vi.fn(), setUserRole: vi.fn(), updateUserProfile: vi.fn(), setUserActive: vi.fn(),
}));

import EditUserPage from "./page";

const user = { id: "u1", email: "ada@x.co", name: "Ada", role: "listener", createdAt: "2026-10-01T00:00:00Z", deactivated: false, invite: { status: "none" } };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireLabelMember.mockResolvedValue(undefined);
  getSessionUser.mockResolvedValue({ sub: "me" });
  getAdminUser.mockResolvedValue(user);
});

describe("EditUserPage", () => {
  it("gates before loading", async () => {
    requireLabelMember.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(EditUserPage(params("u1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAdminUser).not.toHaveBeenCalled();
  });

  it("404s for an unknown user", async () => {
    getAdminUser.mockResolvedValue(null);
    await expect(EditUserPage(params("u1"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows Deactivate for other users", async () => {
    renderWithTheme(await EditUserPage(params("u1")));
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("hides Deactivate on your own page", async () => {
    getSessionUser.mockResolvedValue({ sub: "u1" });
    renderWithTheme(await EditUserPage(params("u1")));
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });
});
