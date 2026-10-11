import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const createArtist = vi.fn();
const updateArtist = vi.fn();
vi.mock("@/lib/admin/artists-actions", () => ({
  createArtist: (...a: unknown[]) => createArtist(...a),
  updateArtist: (...a: unknown[]) => updateArtist(...a),
  deleteArtist: vi.fn(),
  searchLinkableUsers: vi.fn().mockResolvedValue({ users: [], error: null }),
}));

import { ArtistForm } from "./ArtistForm";

const artist = {
  id: "a1",
  name: "Halcyon",
  bio: "Bio",
  createdAt: "2026-10-01T00:00:00Z",
  trackCount: 0,
  albumCount: 0,
  linkedUser: { id: "u1", name: "Ada", email: "ada@x.co" },
};

beforeEach(() => {
  vi.clearAllMocks();
  updateArtist.mockResolvedValue({ error: null });
  createArtist.mockResolvedValue({ error: "Enter a name." });
});

describe("ArtistForm", () => {
  it("creates with the typed values", async () => {
    renderWithTheme(<ArtistForm />);
    await userEvent.type(screen.getByLabelText("Name"), "New Artist");
    await userEvent.type(screen.getByLabelText("Bio"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Create artist" }));
    expect(createArtist).toHaveBeenCalledWith({ name: "New Artist", bio: "Hello", userId: null });
  });

  it("shows the action's error", async () => {
    renderWithTheme(<ArtistForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create artist" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name.");
  });

  it("edits, unlinks, and shows Saved", async () => {
    renderWithTheme(<ArtistForm artist={artist} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear linked user" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateArtist).toHaveBeenCalledWith("a1", { name: "Halcyon", bio: "Bio", userId: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("rethrows redirects so navigation happens", async () => {
    const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/admin/artists/x" });
    createArtist.mockRejectedValue(redirectErr);
    // The rethrow escapes the submit handler as an unhandled rejection; record it
    // (and swallow it) so we can assert it happened without failing the run.
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    const existing = process.listeners("unhandledRejection");
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", onRejection);
    try {
      renderWithTheme(<ArtistForm />);
      await userEvent.type(screen.getByLabelText("Name"), "X");
      await userEvent.click(screen.getByRole("button", { name: "Create artist" }));
      await waitFor(() => expect(rejections).toEqual([redirectErr]));
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      process.removeListener("unhandledRejection", onRejection);
      existing.forEach((l) => process.on("unhandledRejection", l));
    }
  });
});
