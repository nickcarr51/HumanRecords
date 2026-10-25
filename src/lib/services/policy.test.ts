import { describe, expect, it } from "vitest";
import { asSystem } from "@/lib/db/system";
import { DomainError } from "./errors";
import { authorize } from "./policy";
import type { JwtClaims, Viewer } from "./viewer";
import type { Grant } from "./policy";

const viewer = (role: Viewer["role"]): Viewer => ({ userId: "u1", role, claims: { sub: "u1" } as JwtClaims });

describe("authorize", () => {
  it("grants users.list to a label member", () => {
    expect(authorize(viewer("label_member"), "users.list").action).toBe("users.list");
  });

  it.each(["listener", "artist", null] as const)("forbids users.list for %s", (role) => {
    expect(() => authorize(viewer(role), "users.list")).toThrow(DomainError);
    try {
      authorize(viewer(role), "users.list");
    } catch (e) {
      expect((e as DomainError).code).toBe("FORBIDDEN");
    }
  });

  it("asSystem only accepts a Grant made by authorize (checked by yarn typecheck)", () => {
    const forge = () =>
      // @ts-expect-error a hand-built object is not a Grant
      asSystem({ action: "users.list" }, async () => 1);
    expect(typeof forge).toBe("function"); // never invoked: this is a compile-time test
  });

  it("asSystem rejects a forged grant at runtime", async () => {
    await expect(asSystem({ action: "users.list" } as unknown as Grant, async () => 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
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
