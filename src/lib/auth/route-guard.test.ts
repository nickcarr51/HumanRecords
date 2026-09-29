import { describe, expect, it } from "vitest";
import { authRedirectPath } from "./route-guard";

describe("authRedirectPath", () => {
  it("sends signed-out users off protected routes to /login", () => {
    expect(authRedirectPath("/dashboard", false)).toBe("/login");
    expect(authRedirectPath("/dashboard/settings", false)).toBe("/login");
    expect(authRedirectPath("/feed", false)).toBe("/login");
    expect(authRedirectPath("/albums/abc", false)).toBe("/login");
  });

  it("lets signed-in users into protected routes", () => {
    expect(authRedirectPath("/dashboard", true)).toBeNull();
    expect(authRedirectPath("/feed", true)).toBeNull();
    expect(authRedirectPath("/albums/abc", true)).toBeNull();
  });

  it("sends signed-in users away from /login and / to /feed", () => {
    expect(authRedirectPath("/login", true)).toBe("/feed");
    expect(authRedirectPath("/", true)).toBe("/feed");
  });

  it("retires /artists: signed-in users are sent to /feed", () => {
    expect(authRedirectPath("/artists", true)).toBe("/feed");
    expect(authRedirectPath("/artists/123", true)).toBe("/feed");
  });

  it("sends signed-out users off /artists to /login", () => {
    expect(authRedirectPath("/artists", false)).toBe("/login");
    expect(authRedirectPath("/artists/123", false)).toBe("/login");
  });

  it("leaves public routes alone", () => {
    expect(authRedirectPath("/", false)).toBeNull();
    expect(authRedirectPath("/login", false)).toBeNull();
    expect(authRedirectPath("/auth/confirm", false)).toBeNull();
  });
});
