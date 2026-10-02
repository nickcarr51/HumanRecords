import { describe, expect, it } from "vitest";
import { inviteUrl } from "./url";

describe("inviteUrl", () => {
  it("builds /login with email and invite params on SITE_URL", () => {
    const url = new URL(inviteUrl("ada@example.com", "tok", "http://127.0.0.1:3000"));
    expect(url.origin).toBe("http://127.0.0.1:3000");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("email")).toBe("ada@example.com");
    expect(url.searchParams.get("invite")).toBe("tok");
  });

  it("round-trips a + in the email (not decoded as a space)", () => {
    const url = new URL(inviteUrl("guest+1@example.com", "tok", "https://example.org"));
    expect(url.searchParams.get("email")).toBe("guest+1@example.com");
  });

  it("ignores a path or trailing slash on SITE_URL", () => {
    expect(inviteUrl("a@b.co", "t", "https://example.org/")).toBe(
      "https://example.org/login?email=a%40b.co&invite=t",
    );
  });

  it("throws when SITE_URL is missing", () => {
    expect(() => inviteUrl("a@b.co", "t", "")).toThrow(/SITE_URL/);
    expect(() => inviteUrl("a@b.co", "t", undefined)).toThrow(/SITE_URL/);
  });
});
