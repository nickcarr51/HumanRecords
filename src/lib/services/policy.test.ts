import { afterEach, describe, expect, it, vi } from "vitest";
import { asSystem } from "@/lib/db/system";
import { authorize } from "./policy";
import type { JwtClaims, Viewer } from "./viewer";
import type { Grant } from "./policy";

// The role rules run against real signed-in users in policy.data.test.ts.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authorize", () => {
  it("refuses a hand-built Viewer, even a label member", () => {
    const forged = { userId: "u1", role: "label_member", claims: { sub: "u1" } } as unknown as Viewer;
    expect(() => authorize(forged, "users.list")).toThrow(
      expect.objectContaining({ name: "DomainError", code: "FORBIDDEN" }),
    );
  });

  it("asSystem only accepts a Grant made by authorize (checked by yarn typecheck)", () => {
    const forge = () =>
      // @ts-expect-error a hand-built object is not a Grant
      asSystem({ action: "users.list" }, "users.list", async () => 1);
    expect(typeof forge).toBe("function"); // never invoked: this is a compile-time test
  });

  it("asSystem rejects a forged grant at runtime, before any database access", async () => {
    // With no DATABASE_URL, any database access would fail with "Missing
    // DATABASE_URL" instead of FORBIDDEN.
    vi.stubEnv("DATABASE_URL", "");
    const fn = vi.fn(async () => 1);
    await expect(asSystem({ action: "users.list" } as unknown as Grant, "users.list", fn)).rejects.toMatchObject({
      name: "DomainError",
      code: "FORBIDDEN",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("a hand-built claims object is not JwtClaims (checked by yarn typecheck)", () => {
    const forge = () => {
      // @ts-expect-error a hand-built object is not verified claims
      const c: JwtClaims = { sub: "x" };
      return c;
    };
    expect(typeof forge).toBe("function");
  });
});
