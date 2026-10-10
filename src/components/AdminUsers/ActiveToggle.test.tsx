import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const setUserActive = vi.fn();
vi.mock("@/lib/admin/users-actions", () => ({ setUserActive: (...a: unknown[]) => setUserActive(...a) }));

import { ActiveToggle } from "./ActiveToggle";

const base = { id: "u1", email: "ada@x.co", name: "Ada", role: "listener" as const, createdAt: "2026-10-01T00:00:00Z", deactivated: false, invite: { status: "none" as const } };

beforeEach(() => {
  vi.clearAllMocks();
  setUserActive.mockResolvedValue({ error: null });
});

describe("ActiveToggle", () => {
  it("confirms before deactivating", async () => {
    renderWithTheme(<ActiveToggle user={base} />);
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Deactivate ada@x.co?");
    await userEvent.click(screen.getByRole("button", { name: "Deactivate account" }));
    expect(setUserActive).toHaveBeenCalledWith("u1", false);
  });

  it("reactivates without a confirm and shows errors", async () => {
    setUserActive.mockResolvedValue({ error: "Couldn't save. Try again." });
    renderWithTheme(<ActiveToggle user={{ ...base, deactivated: true }} />);
    await userEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    expect(setUserActive).toHaveBeenCalledWith("u1", true);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
  });
});
