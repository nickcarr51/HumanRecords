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
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import LoginPage from "./page";

async function reachCodeStep() {
  requestOtp.mockResolvedValue({ error: null });
  renderWithTheme(<LoginPage />);
  await userEvent.type(screen.getByLabelText(/email/i), "ada@example.com");
  await userEvent.click(screen.getByRole("button", { name: /send code/i }));
  await screen.findByLabelText(/code/i);
}

describe("LoginPage", () => {
  beforeEach(() => {
    requestOtp.mockReset();
    submitOtp.mockReset();
  });

  it("moves to the code step after a successful OTP request", async () => {
    requestOtp.mockResolvedValue({ error: null });
    renderWithTheme(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send code/i }));

    expect(requestOtp).toHaveBeenCalledWith("ada@example.com");
    expect(await screen.findByLabelText(/code/i)).toBeInTheDocument();
  });

  it("shows the error when the OTP request fails", async () => {
    requestOtp.mockResolvedValue({ error: "not invited" });
    renderWithTheme(<LoginPage />);

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
});
