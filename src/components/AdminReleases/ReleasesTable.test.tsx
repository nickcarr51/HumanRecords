import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";
import type { AdminReleaseRow } from "@/lib/admin/releases";

const setPinned = vi.fn();
const moveRelease = vi.fn();
vi.mock("@/lib/admin/release-actions", () => ({
  setPinned: (...a: unknown[]) => setPinned(...a),
  moveRelease: (...a: unknown[]) => moveRelease(...a),
  archiveRelease: vi.fn(),
  restoreRelease: vi.fn(),
}));

import { ReleasesTable } from "./ReleasesTable";

const row = (id: string, over: Partial<AdminReleaseRow> = {}): AdminReleaseRow => ({
  id, kind: "single", title: id, artistNames: ["Nova"], createdAt: "2026-10-01T00:00:00Z",
  pinned: false, archived: false, liveTrackCount: 1, ...over,
});

// Feed order: an archived pinned row sorts above the live pinned one.
const releases = [
  row("OldPinned", { pinned: true, archived: true }),
  row("Comp", { kind: "album", pinned: true, artistNames: [], liveTrackCount: 5 }),
  row("A"),
  row("B"),
  row("Gone", { archived: true }),
];

const group = (name: string) => screen.getByRole("region", { name });
const tr = (title: string) => screen.getByRole("link", { name: title }).closest("tr")!;

beforeEach(() => {
  vi.clearAllMocks();
  setPinned.mockResolvedValue({ error: null });
  moveRelease.mockResolvedValue({ error: null });
});

describe("ReleasesTable", () => {
  it("groups live rows into Pinned and Feed and hides archived by default", () => {
    renderWithTheme(<ReleasesTable releases={releases} showArchived={false} />);
    expect(within(group("Pinned")).getByRole("link", { name: "Comp" })).toBeInTheDocument();
    expect(within(group("Feed")).getAllByRole("link").map((l) => l.textContent)).toEqual(["A", "B"]);
    expect(screen.queryByRole("region", { name: "Archived" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show archived (2)" })).toHaveAttribute("href", "/admin/releases?archived=1");
    expect(within(tr("Comp")).getByText("Various Artists")).toBeInTheDocument();
  });

  it("disables arrows at each live group's edges, ignoring archived rows", () => {
    renderWithTheme(<ReleasesTable releases={releases} showArchived={false} />);
    expect(within(tr("Comp")).getByRole("button", { name: "Move Comp up" })).toBeDisabled();
    expect(within(tr("Comp")).getByRole("button", { name: "Move Comp down" })).toBeDisabled();
    expect(within(tr("A")).getByRole("button", { name: "Move A up" })).toBeDisabled();
    expect(within(tr("A")).getByRole("button", { name: "Move A down" })).toBeEnabled();
    expect(within(tr("B")).getByRole("button", { name: "Move B down" })).toBeDisabled();
  });

  it("shows archived rows with only Restore when toggled on", () => {
    renderWithTheme(<ReleasesTable releases={releases} showArchived />);
    const archived = group("Archived");
    expect(within(archived).getAllByRole("link").map((l) => l.textContent)).toEqual(["OldPinned", "Gone"]);
    expect(within(tr("Gone")).getByRole("button", { name: "Restore Gone" })).toBeInTheDocument();
    expect(within(tr("Gone")).queryByRole("button", { name: /Move/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hide archived" })).toHaveAttribute("href", "/admin/releases");
  });

  it("pins, moves, and shows an inline error on failure", async () => {
    renderWithTheme(<ReleasesTable releases={releases} showArchived={false} />);
    await userEvent.click(within(tr("A")).getByRole("button", { name: "Pin A" }));
    expect(setPinned).toHaveBeenCalledWith("A", true);
    await userEvent.click(within(tr("Comp")).getByRole("button", { name: "Unpin Comp" }));
    expect(setPinned).toHaveBeenCalledWith("Comp", false);
    moveRelease.mockResolvedValueOnce({ error: "Couldn't reorder — try again" });
    await userEvent.click(within(tr("A")).getByRole("button", { name: "Move A down" }));
    expect(moveRelease).toHaveBeenCalledWith("A", "down");
    expect(within(tr("A")).getByRole("alert")).toHaveTextContent("Couldn't reorder — try again");
  });
});
