import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";
import type { AdminUserRow } from "@/lib/admin/users-types";

const issueInvite = vi.fn();
const setUserRole = vi.fn();
vi.mock("@/lib/admin/users-actions", () => ({
  createUser: vi.fn(),
  issueInvite: (...a: unknown[]) => issueInvite(...a),
  setUserRole: (...a: unknown[]) => setUserRole(...a),
}));

import { UsersTable } from "./UsersTable";

const URL_ = "http://127.0.0.1:3000/login?email=new%40x.co&invite=tok";
const users: AdminUserRow[] = [
  { id: "me", email: "me@x.co", name: "Me", role: "label_member", createdAt: "2026-10-01T00:00:00Z", invite: { status: "none" } },
  { id: "new", email: "new@x.co", name: "New Person", role: "listener", createdAt: "2026-10-02T00:00:00Z", invite: { status: "unused", url: URL_ } },
  { id: "old", email: "old@x.co", name: null, role: "artist", createdAt: "2026-09-01T00:00:00Z", invite: { status: "used", usedAt: "2026-10-02T15:00:00Z" } },
];

function row(email: string) {
  return screen.getByText(email).closest("tr")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  issueInvite.mockResolvedValue({ error: null });
  setUserRole.mockResolvedValue({ error: null });
});

describe("UsersTable", () => {
  it("renders the three invite states", () => {
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    expect(within(row("me@x.co")).getByText("No link")).toBeInTheDocument();
    expect(within(row("me@x.co")).getByRole("button", { name: "Create link" })).toBeInTheDocument();

    const unused = within(row("new@x.co"));
    expect(unused.getByText("Not used yet")).toBeInTheDocument();
    expect(unused.getByText(URL_)).toBeInTheDocument();
    expect(unused.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(unused.getByRole("link", { name: "Email" })).toHaveAttribute("href", expect.stringMatching(/^mailto:new@x\.co\?/));
    expect(unused.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();

    const used = within(row("old@x.co"));
    expect(used.getByText(/^Used /)).toBeInTheDocument();
    expect(used.getByRole("button", { name: "New link" })).toBeInTheDocument();
  });

  it("disables the role select on your own row only", () => {
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    expect(within(row("me@x.co")).getByRole("combobox")).toBeDisabled();
    expect(within(row("new@x.co")).getByRole("combobox")).toBeEnabled();
  });

  it("asks before regenerating and respects Cancel", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    await userEvent.click(within(row("new@x.co")).getByRole("button", { name: "Regenerate" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/NFC card/));
    expect(issueInvite).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(within(row("new@x.co")).getByRole("button", { name: "Regenerate" }));
    expect(issueInvite).toHaveBeenCalledWith("new");
  });

  it("creates a link and a new link without a confirm", async () => {
    const confirm = vi.spyOn(window, "confirm");
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    await userEvent.click(within(row("me@x.co")).getByRole("button", { name: "Create link" }));
    await userEvent.click(within(row("old@x.co")).getByRole("button", { name: "New link" }));
    expect(issueInvite).toHaveBeenNthCalledWith(1, "me");
    expect(issueInvite).toHaveBeenNthCalledWith(2, "old");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("copies the URL", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    await user.click(within(row("new@x.co")).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(await within(row("new@x.co")).findByRole("button", { name: "Copied ✓" })).toBeInTheDocument();
  });

  it("saves a role change and reverts on error", async () => {
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    const select = within(row("new@x.co")).getByRole("combobox");
    await userEvent.selectOptions(select, "artist");
    expect(setUserRole).toHaveBeenCalledWith("new", "artist");
    expect(await within(row("new@x.co")).findByText("Saved")).toBeInTheDocument();

    setUserRole.mockResolvedValue({ error: "That user no longer exists." });
    await userEvent.selectOptions(select, "label_member");
    expect(await within(row("new@x.co")).findByRole("alert")).toHaveTextContent("That user no longer exists.");
    expect(select).toHaveValue("artist");
  });

  it("shows an action error inline", async () => {
    issueInvite.mockResolvedValue({ error: "Couldn't create the link. Try again." });
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    await userEvent.click(within(row("me@x.co")).getByRole("button", { name: "Create link" }));
    expect(await within(row("me@x.co")).findByRole("alert")).toHaveTextContent(/couldn't create the link/i);
  });
  it("recovers when issueInvite throws (network drop)", async () => {
    issueInvite.mockRejectedValue(new Error("network"));
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    const btn = within(row("me@x.co")).getByRole("button", { name: "Create link" });
    await userEvent.click(btn);
    expect(await within(row("me@x.co")).findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(btn).toBeEnabled();
  });

  it("recovers and reverts when setUserRole throws", async () => {
    setUserRole.mockRejectedValue(new Error("network"));
    renderWithTheme(<UsersTable users={users} selfId="me" />);
    const select = within(row("new@x.co")).getByRole("combobox");
    await userEvent.selectOptions(select, "artist");
    expect(await within(row("new@x.co")).findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(select).toHaveValue("listener");
    expect(select).toBeEnabled();
  });
});
