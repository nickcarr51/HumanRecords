import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const requestOtp = vi.fn();
const submitOtp = vi.fn();
vi.mock("@/lib/auth/actions", () => ({
  requestOtp: (...a: unknown[]) => requestOtp(...a),
  submitOtp: (...a: unknown[]) => submitOtp(...a),
}));

import { LoginForm } from "./LoginForm";

async function reachCodeStep() {
  requestOtp.mockResolvedValue({ error: null });
  renderWithTheme(<LoginForm />);
  await userEvent.type(screen.getByLabelText(/email/i), "ada@example.com");
  await userEvent.click(screen.getByRole("button", { name: /send code/i }));
  await screen.findByLabelText(/code/i);
}

describe("LoginForm", () => {
  beforeEach(() => {
    requestOtp.mockReset();
    submitOtp.mockReset();
  });

  it("moves to the code step after a successful OTP request", async () => {
    requestOtp.mockResolvedValue({ error: null });
    renderWithTheme(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send code/i }));

    expect(requestOtp).toHaveBeenCalledWith("ada@example.com");
    expect(await screen.findByLabelText(/code/i)).toBeInTheDocument();
  });

  it("shows the error when the OTP request fails", async () => {
    requestOtp.mockResolvedValue({ error: "not invited" });
    renderWithTheme(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "nope@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send code/i }));

    expect(await screen.findByText(/not invited/i)).toBeInTheDocument();
  });

  it("returns to the email step via 'use a different email'", async () => {
    await reachCodeStep();

    await userEvent.click(
      screen.getByRole("button", { name: /different email/i }),
    );

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it("resends the code from the code step", async () => {
    await reachCodeStep();
    requestOtp.mockClear();

    await userEvent.click(screen.getByRole("button", { name: /resend code/i }));

    expect(requestOtp).toHaveBeenCalledWith("ada@example.com");
  });

  it("pre-fills the email from initialEmail and never sends a code on mount", async () => {
    renderWithTheme(<LoginForm initialEmail="guest+1@example.com" />);
    expect(screen.getByLabelText(/email/i)).toHaveValue("guest+1@example.com");
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("shows the link-failed message", () => {
    renderWithTheme(<LoginForm linkFailed />);
    expect(screen.getByRole("alert")).toHaveTextContent(/link didn.t work/i);
  });

  it("shows an initial error", () => {
    renderWithTheme(<LoginForm initialError="That link has already been used." />);
    expect(screen.getByRole("alert")).toHaveTextContent("That link has already been used.");
  });

  it("passes next through to submitOtp", async () => {
    requestOtp.mockResolvedValue({ error: null });
    submitOtp.mockResolvedValue({ error: "bad" });
    renderWithTheme(<LoginForm initialEmail="ada@example.com" next="/albums/1" />);
    await userEvent.click(screen.getByRole("button", { name: /send code/i }));
    await userEvent.type(await screen.findByLabelText(/code/i), "12345678");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));
    expect(submitOtp).toHaveBeenCalledWith("ada@example.com", "12345678", "/albums/1");
  });
});
