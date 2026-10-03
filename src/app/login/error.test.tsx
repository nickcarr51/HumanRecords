import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";
import LoginError from "./error";

describe("LoginError", () => {
  it("shows the copy, links to /login, and Try again calls reset", async () => {
    const reset = vi.fn();
    renderWithTheme(<LoginError error={new Error("x")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText(/couldn.t sign you in/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in with email/i })).toHaveAttribute("href", "/login");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
