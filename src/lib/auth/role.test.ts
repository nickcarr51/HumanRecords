import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createClient = vi.fn(async () => ({ rpc }));
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import { getCurrentRole, requireLabelMember } from "./role";

beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockImplementation(async () => ({ rpc }));
});

describe("getCurrentRole", () => {
  it("returns the role from current_user_role()", async () => {
    rpc.mockResolvedValue({ data: "label_member", error: null });
    expect(await getCurrentRole()).toBe("label_member");
    expect(rpc).toHaveBeenCalledWith("current_user_role");
  });

  it("returns null on error or no row", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getCurrentRole()).toBeNull();
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getCurrentRole()).toBeNull();
  });

  it("returns null when the client or rpc throws", async () => {
    rpc.mockRejectedValue(new Error("network"));
    expect(await getCurrentRole()).toBeNull();
    createClient.mockRejectedValue(new Error("no cookies"));
    expect(await getCurrentRole()).toBeNull();
  });
});

describe("requireLabelMember", () => {
  it("resolves for label members", async () => {
    rpc.mockResolvedValue({ data: "label_member", error: null });
    await expect(requireLabelMember()).resolves.toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each(["listener", "artist", null])("calls notFound for role %s", async (role) => {
    rpc.mockResolvedValue({ data: role, error: null });
    await expect(requireLabelMember()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
