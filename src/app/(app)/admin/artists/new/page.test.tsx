import { describe, expect, it, vi } from "vitest";

const requireLabelMember = vi.fn();
vi.mock("@/lib/auth/role", () => ({ requireLabelMember: () => requireLabelMember() }));
vi.mock("@/lib/admin/artists-actions", () => ({ createArtist: vi.fn(), updateArtist: vi.fn(), searchLinkableUsers: vi.fn() }));

import NewArtistPage from "./page";

describe("NewArtistPage", () => {
  it("gates", async () => {
    requireLabelMember.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(NewArtistPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("renders for label members", async () => {
    requireLabelMember.mockResolvedValue(undefined);
    expect(await NewArtistPage()).toBeTruthy();
  });
});
