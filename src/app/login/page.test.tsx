import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const requestOtp = vi.fn();
const submitOtp = vi.fn();
vi.mock("@/lib/auth/actions", () => ({
  requestOtp: (...a: unknown[]) => requestOtp(...a),
  submitOtp: (...a: unknown[]) => submitOtp(...a),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  it("moves to the code step after a successful OTP request", async () => {
    requestOtp.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send code/i }));

    expect(requestOtp).toHaveBeenCalledWith("ada@example.com");
    expect(await screen.findByLabelText(/code/i)).toBeInTheDocument();
  });

  it("shows the error when the OTP request fails", async () => {
    requestOtp.mockResolvedValue({ error: "not invited" });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "nope@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send code/i }));

    expect(await screen.findByText(/not invited/i)).toBeInTheDocument();
  });
});
