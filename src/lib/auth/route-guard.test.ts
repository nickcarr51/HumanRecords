import { describe, expect, it } from "vitest";
import { authRedirectPath } from "./route-guard";

describe("authRedirectPath", () => {
  it("sends signed-out users off protected routes to /login", () => {
    expect(authRedirectPath("/dashboard", false)).toBe("/login");
    expect(authRedirectPath("/dashboard/settings", false)).toBe("/login");
  });

  it("lets signed-in users into protected routes", () => {
    expect(authRedirectPath("/dashboard", true)).toBeNull();
  });

  it("sends signed-in users away from /login to /dashboard", () => {
    expect(authRedirectPath("/login", true)).toBe("/dashboard");
  });

  it("leaves public routes alone", () => {
    expect(authRedirectPath("/", false)).toBeNull();
    expect(authRedirectPath("/login", false)).toBeNull();
    expect(authRedirectPath("/auth/confirm", false)).toBeNull();
  });
});
