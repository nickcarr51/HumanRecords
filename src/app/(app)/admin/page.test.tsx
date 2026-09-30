import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLabelMember = vi.fn();
vi.mock("@/lib/auth/role", () => ({ requireLabelMember: () => requireLabelMember() }));
vi.mock("@/lib/admin/actions", () => ({
  searchArtists: vi.fn(),
  createUploadUrls: vi.fn(),
  publishRelease: vi.fn(),
}));

import AdminPage from "./page";

beforeEach(() => vi.clearAllMocks());

// The admin layout gate doesn't re-run on client navigation, so the page must
// check the role itself before rendering anything.
describe("AdminPage", () => {
  it("rejects without rendering when the caller isn't a label member", async () => {
    requireLabelMember.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireLabelMember).toHaveBeenCalledTimes(1);
  });

  it("renders for label members", async () => {
    requireLabelMember.mockResolvedValue(undefined);
    expect(await AdminPage()).toBeTruthy();
    expect(requireLabelMember).toHaveBeenCalledTimes(1);
  });
});
