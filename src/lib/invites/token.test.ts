import { describe, expect, it } from "vitest";
import { INVITE_TOKEN_RE, generateInviteToken } from "./token";

describe("generateInviteToken", () => {
  it("is 43 base64url characters", () => {
    const t = generateInviteToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(INVITE_TOKEN_RE);
  });

  it("differs on every call", () => {
    const seen = new Set(Array.from({ length: 50 }, generateInviteToken));
    expect(seen.size).toBe(50);
  });
});

describe("INVITE_TOKEN_RE", () => {
  it("rejects wrong lengths and characters", () => {
    expect(INVITE_TOKEN_RE.test("short")).toBe(false);
    expect(INVITE_TOKEN_RE.test(`${"a".repeat(42)}=`)).toBe(false);
    expect(INVITE_TOKEN_RE.test(` ${"a".repeat(43)}`)).toBe(false);
  });
});
