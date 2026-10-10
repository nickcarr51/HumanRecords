import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const updateUserProfile = vi.fn();
vi.mock("@/lib/admin/users-actions", () => ({ updateUserProfile: (...a: unknown[]) => updateUserProfile(...a) }));

import { UserForm } from "./UserForm";

const user = { id: "u1", email: "ada@x.co", name: "Ada", role: "listener" as const, createdAt: "2026-10-01T00:00:00Z", deactivated: false, invite: { status: "none" as const } };

beforeEach(() => {
  vi.clearAllMocks();
  updateUserProfile.mockResolvedValue({ error: null });
});

describe("UserForm", () => {
  it("warns only once the email differs", async () => {
    renderWithTheme(<UserForm user={user} />);
    expect(screen.queryByText("Sign-in codes will go to the new address.")).toBeNull();
    const email = screen.getByLabelText("Email");
    await userEvent.clear(email);
    await userEvent.type(email, "new@x.co");
    expect(screen.getByText("Sign-in codes will go to the new address.")).toBeInTheDocument();
  });

  it("saves name and email and shows Saved", async () => {
    renderWithTheme(<UserForm user={user} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Ada L");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateUserProfile).toHaveBeenCalledWith("u1", { name: "Ada L", email: "ada@x.co" });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("shows the action's error", async () => {
    updateUserProfile.mockResolvedValue({ error: "That email already has an account." });
    renderWithTheme(<UserForm user={user} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That email already has an account.");
  });
});
