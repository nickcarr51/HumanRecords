import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const archiveRelease = vi.fn();
const restoreRelease = vi.fn();
vi.mock("@/lib/admin/release-actions", () => ({
  archiveRelease: (...a: unknown[]) => archiveRelease(...a),
  restoreRelease: (...a: unknown[]) => restoreRelease(...a),
}));

import { ArchiveControl } from "./ArchiveControl";

beforeEach(() => {
  vi.clearAllMocks();
  archiveRelease.mockResolvedValue({ error: null });
  restoreRelease.mockResolvedValue({ error: null });
});

describe("ArchiveControl", () => {
  it("disables Archive when disabled", () => {
    renderWithTheme(<ArchiveControl releaseId="r1" title="X" archived={false} disabled />);
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
  });

  it("asks for confirmation before archiving", async () => {
    renderWithTheme(<ArchiveControl releaseId="r1" title="Night Drives" archived={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("dialog", { name: 'Archive "Night Drives"?' })).toBeInTheDocument();
    expect(archiveRelease).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Archive release" }));
    expect(archiveRelease).toHaveBeenCalledWith("r1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open and shows the error when archiving fails", async () => {
    archiveRelease.mockResolvedValue({ error: "Release not found." });
    renderWithTheme(<ArchiveControl releaseId="r1" title="X" archived={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive release" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Release not found.");
  });

  it("restores without a dialog", async () => {
    renderWithTheme(<ArchiveControl releaseId="r1" title="X" archived />);
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(restoreRelease).toHaveBeenCalledWith("r1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
