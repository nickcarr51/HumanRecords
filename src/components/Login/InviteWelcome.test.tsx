import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const redeemInviteForm = vi.fn();
const requestOtp = vi.fn();
vi.mock("@/lib/auth/actions", () => ({
  redeemInviteForm: (...a: unknown[]) => redeemInviteForm(...a),
  redeemInvite: vi.fn(),
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

  it("renders a hidden token input inside the form", () => {
    const { container } = renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" />);
    const input = container.querySelector('input[type="hidden"][name="token"]');
    expect(input).toHaveValue(TOKEN);
  });

  it("calls the action with FormData carrying the token on Enter, and nothing on render", async () => {
    redeemInviteForm.mockResolvedValue({ error: null });
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" />);
    expect(redeemInviteForm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Enter" }));
    expect(redeemInviteForm).toHaveBeenCalledTimes(1);
    const fd = redeemInviteForm.mock.calls[0][1] as FormData;
    expect(fd.get("token")).toBe(TOKEN);
  });

  it("disables Enter while pending so a double tap calls once", async () => {
    // Resolved at the end: React entangles async transitions globally, so a
    // never-settling action would stall later tests.
    let finish!: (v: { error: string | null }) => void;
    redeemInviteForm.mockReturnValue(new Promise((r) => (finish = r)));
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" />);
    const enter = screen.getByRole("button", { name: "Enter" });
    await userEvent.click(enter);
    await userEvent.click(enter);
    expect(redeemInviteForm).toHaveBeenCalledTimes(1);
    expect(enter).toBeDisabled();
    await act(async () => finish({ error: null }));
  });

  it("switches to the email form, pre-filled, with the error on failure", async () => {
    redeemInviteForm.mockResolvedValue({ error: "That link has already been used — sign in with your email below." });
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" email="jane@example.com" />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Enter" }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/already been used/);
    expect(screen.getByLabelText(/email/i)).toHaveValue("jane@example.com");
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("'Not you?' shows an empty email form", async () => {
    renderWithTheme(<InviteWelcome token={TOKEN} name="Jane" email="jane@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: /not you/i }));
    expect(screen.getByLabelText(/email/i)).toHaveValue("");
    expect(redeemInviteForm).not.toHaveBeenCalled();
  });
});
