import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const createUser = vi.fn();
vi.mock("@/lib/admin/users-actions", () => ({
  createUser: (...a: unknown[]) => createUser(...a),
  issueInvite: vi.fn(),
  setUserRole: vi.fn(),
}));

import { NewUserForm } from "./NewUserForm";

beforeEach(() => vi.clearAllMocks());

describe("NewUserForm", () => {
  it("submits email, name, and role; clears and confirms on success", async () => {
    createUser.mockResolvedValue({ error: null });
    renderWithTheme(<NewUserForm />);
    await userEvent.type(screen.getByLabelText("Email"), "Guest@Example.com");
    await userEvent.type(screen.getByLabelText("Name"), "Guest");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "artist");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(createUser).toHaveBeenCalledWith({ email: "Guest@Example.com", name: "Guest", role: "artist" });
    expect(await screen.findByText(/invite link created for guest@example.com/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Role")).toHaveValue("listener");
  });

  it("defaults role to listener", () => {
    renderWithTheme(<NewUserForm />);
    expect(screen.getByLabelText("Role")).toHaveValue("listener");
  });

  it("shows the error and keeps the fields on failure", async () => {
    createUser.mockResolvedValue({ error: "That email already has an account — use its row in the table." });
    renderWithTheme(<NewUserForm />);
    await userEvent.type(screen.getByLabelText("Email"), "dup@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already has an account/);
    expect(screen.getByLabelText("Email")).toHaveValue("dup@example.com");
  });
});
