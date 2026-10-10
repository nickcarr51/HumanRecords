import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";
import type { AdminRelease } from "@/lib/admin/releases";

const saveRelease = vi.fn();
vi.mock("@/lib/admin/release-actions", () => ({
  saveRelease: (...a: unknown[]) => saveRelease(...a),
  archiveRelease: vi.fn(), restoreRelease: vi.fn(), removeTrack: vi.fn(),
  restoreTrack: vi.fn(), addAlbumTrack: vi.fn(), replaceTrackAudio: vi.fn(),
}));
vi.mock("@/lib/admin/actions", () => ({ createUploadUrls: vi.fn(), searchArtists: vi.fn(async () => ({ artists: [], error: null })) }));
vi.mock("@/components/Upload/upload-engine", () => ({ putFile: vi.fn() }));

import { EditReleaseForm } from "./EditReleaseForm";

const album: AdminRelease = {
  id: "r1", kind: "album", title: "Night", pinned: false, archived: false,
  album: { title: "Night", artists: [{ id: "a1", name: "Nova" }] },
  tracks: [
    { id: "t1", title: "One", artists: [{ id: "a1", name: "Nova" }], archived: false },
    { id: "t2", title: "Two", artists: [{ id: "a1", name: "Nova" }], archived: false },
    { id: "t3", title: "Gone", artists: [{ id: "a1", name: "Nova" }], archived: true },
  ],
};
const single: AdminRelease = {
  id: "r2", kind: "single", title: "Solo", pinned: false, archived: false, album: null,
  tracks: [{ id: "s1", title: "Solo", artists: [{ id: "a1", name: "Nova" }], archived: false }],
};

beforeEach(() => {
  vi.clearAllMocks();
  saveRelease.mockResolvedValue({ error: null });
});

describe("EditReleaseForm", () => {
  it("starts clean: Save disabled, instant actions enabled, ID3 hint shown", () => {
    renderWithTheme(<EditReleaseForm release={album} />);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Remove" })[0]).toBeEnabled();
    expect(screen.getByText(/Downloads keep the MP3's own tags/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Removed tracks" })).toHaveTextContent("Gone");
  });

  it("locks instant actions while the draft is dirty, and Discard unlocks", async () => {
    renderWithTheme(<EditReleaseForm release={album} />);
    await userEvent.type(screen.getByLabelText("Album title"), "!");
    expect(screen.getByText("Save or discard your changes first.")).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: "Remove" })) expect(b).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add track" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore Gone" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText("Album title")).toHaveValue("Night");
    expect(screen.getAllByRole("button", { name: "Remove" })[0]).toBeEnabled();
  });

  it("saves the reordered, edited draft", async () => {
    renderWithTheme(<EditReleaseForm release={album} />);
    await userEvent.click(screen.getByRole("button", { name: "Move track 2 up" }));
    await userEvent.clear(screen.getByLabelText("Album title"));
    await userEvent.type(screen.getByLabelText("Album title"), "Night II");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(saveRelease).toHaveBeenCalledWith("r1", {
      album: { title: "Night II", artists: [{ id: "a1" }] },
      tracks: [
        { id: "t2", title: "Two", artists: [{ id: "a1" }] },
        { id: "t1", title: "One", artists: [{ id: "a1" }] },
      ],
    });
  });

  it("blocks saving a whitespace-only title and shows server errors", async () => {
    renderWithTheme(<EditReleaseForm release={album} />);
    await userEvent.clear(screen.getAllByLabelText("Track title")[0]);
    await userEvent.type(screen.getAllByLabelText("Track title")[0], "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(saveRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Title is required.")).toBeInTheDocument();

    await userEvent.type(screen.getAllByLabelText("Track title")[0], "Uno");
    saveRelease.mockResolvedValueOnce({ error: "This release changed since you opened it. Reload the page." });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This release changed since you opened it.");
  });

  it("singles have no album fields, reorder, remove, or add", () => {
    renderWithTheme(<EditReleaseForm release={single} />);
    expect(screen.queryByLabelText("Album title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move track/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add track" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Replace MP3")).toBeInTheDocument();
  });

  it("archived releases are read-only with a banner and Restore", () => {
    renderWithTheme(<EditReleaseForm release={{ ...album, archived: true }} />);
    expect(screen.getByText("Archived — restore to edit.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("resets the draft when the server data changes", () => {
    const { rerender } = renderWithTheme(<EditReleaseForm release={album} />);
    rerender(<EditReleaseForm release={{ ...album, album: { ...album.album!, title: "Dawn" } }} />);
    expect(screen.getByLabelText("Album title")).toHaveValue("Dawn");
  });

  it("keeps a dirty draft when re-rendered with identical content", async () => {
    const { rerender } = renderWithTheme(<EditReleaseForm release={album} />);
    await userEvent.type(screen.getByLabelText("Album title"), "!");
    rerender(<EditReleaseForm release={structuredClone(album)} />);
    expect(screen.getByLabelText("Album title")).toHaveValue("Night!");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("disables header Archive while dirty", async () => {
    renderWithTheme(<EditReleaseForm release={album} />);
    expect(screen.getByRole("button", { name: "Archive" })).toBeEnabled();
    await userEvent.type(screen.getByLabelText("Album title"), "!");
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
  });

  it("Discard clears a shown save error", async () => {
    saveRelease.mockResolvedValueOnce({ error: "Boom" });
    renderWithTheme(<EditReleaseForm release={album} />);
    await userEvent.type(screen.getByLabelText("Album title"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
