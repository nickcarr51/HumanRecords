import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

const getInviteGreeting = vi.fn();
vi.mock("@/lib/auth/invite", () => ({ getInviteGreeting: (...a: unknown[]) => getInviteGreeting(...a) }));
vi.mock("@/lib/auth/actions", () => ({ requestOtp: vi.fn(), submitOtp: vi.fn(), redeemInvite: vi.fn() }));

import LoginPage, { metadata } from "./page";

const TOKEN = "a".repeat(43);

async function renderPage(params: Record<string, string | string[] | undefined>) {
  renderWithTheme(await LoginPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => vi.clearAllMocks());

describe("LoginPage", () => {
  it("shows the welcome screen for a valid unused invite", async () => {
    getInviteGreeting.mockResolvedValue({ name: "Jane" });
    await renderPage({ email: "jane@example.com", invite: TOKEN });
    expect(getInviteGreeting).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByRole("heading", { name: "Welcome, Jane" })).toBeInTheDocument();
  });

  it("silently ignores a used/unknown invite and pre-fills the email", async () => {
    getInviteGreeting.mockResolvedValue(null);
    await renderPage({ email: "guest+1@example.com", invite: TOKEN });
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue("guest+1@example.com");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("skips the invite lookup without an invite param", async () => {
    await renderPage({});
    expect(getInviteGreeting).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/email/i)).toHaveValue("");
  });

  it("takes the first of repeated params and trims them", async () => {
    getInviteGreeting.mockResolvedValue(null);
    await renderPage({ email: [" a@b.co ", "x@y.co"], invite: [` ${TOKEN} `, "other"] });
    expect(getInviteGreeting).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByLabelText(/email/i)).toHaveValue("a@b.co");
  });

  it("treats an empty invite param as absent", async () => {
    await renderPage({ invite: "  " });
    expect(getInviteGreeting).not.toHaveBeenCalled();
  });

  it("shows the link-failed message for ?error=auth", async () => {
    await renderPage({ error: "auth" });
    expect(screen.getByRole("alert")).toHaveTextContent(/link didn.t work/i);
  });

  it("sends no referrer (tokens live in the URL)", () => {
    expect(metadata.referrer).toBe("no-referrer");
  });
});
