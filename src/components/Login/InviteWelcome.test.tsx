import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const redeemInvite = vi.fn();
const requestOtp = vi.fn();
vi.mock("@/lib/auth/actions", () => ({
  redeemInvite: (...a: unknown[]) => redeemInvite(...a),
  requestOtp: (...a: unknown[]) => requestOtp(...a),
  submitOtp: vi.fn(),
}));

import { InviteWelcome } from "./InviteWelcome";

const TOKEN = "a".repeat(43);

beforeEach(() => vi.clearAllMocks());

describe("InviteWelcome", () => {
  it("greets by name", () => {
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" email="jane@example.com" />);
    expect(screen.getByRole("heading", { name: "Welcome, Jane" })).toBeInTheDocument();
  });

  it("falls back to plain Welcome without a name", () => {
    renderWithTheme(<InviteWelcome token={TOKEN} name={null} />);
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
  });

  it("calls redeemInvite with the token on Enter, and nothing on render", async () => {
    redeemInvite.mockResolvedValue({ error: null });
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" />);
    expect(redeemInvite).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Enter" }));
    expect(redeemInvite).toHaveBeenCalledWith(TOKEN);
  });

  it("disables Enter while pending so a double tap calls once", async () => {
    redeemInvite.mockReturnValue(new Promise(() => {}));
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" />);
    const enter = screen.getByRole("button", { name: "Enter" });
    await userEvent.click(enter);
    await userEvent.click(enter);
    expect(redeemInvite).toHaveBeenCalledTimes(1);
    expect(enter).toBeDisabled();
  });

  it("switches to the email form, pre-filled, with the error on failure", async () => {
    redeemInvite.mockResolvedValue({ error: "That link has already been used — sign in with your email below." });
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" email="jane@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: "Enter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already been used/);
    expect(screen.getByLabelText(/email/i)).toHaveValue("jane@example.com");
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("'Not you?' shows an empty email form", async () => {
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" email="jane@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: /not you/i }));
    expect(screen.getByLabelText(/email/i)).toHaveValue("");
    expect(redeemInvite).not.toHaveBeenCalled();
  });
});
