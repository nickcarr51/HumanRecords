import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
const getSessionUser = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));

import NotFound from "./not-found";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotFound", () => {
  it("redirects a signed-in user to /feed", async () => {
    getSessionUser.mockResolvedValue({ sub: "u1" });
    await NotFound();
    expect(redirect).toHaveBeenCalledWith("/feed");
  });

  it("does not redirect a signed-out user", async () => {
    getSessionUser.mockResolvedValue(null);
    await NotFound();
    expect(redirect).not.toHaveBeenCalled();
  });
});
