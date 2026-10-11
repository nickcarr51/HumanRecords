import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const deleteArtist = vi.fn();
vi.mock("@/lib/admin/artists-actions", () => ({ deleteArtist: (...a: unknown[]) => deleteArtist(...a) }));

import { DeleteArtist } from "./DeleteArtist";

beforeEach(() => {
  vi.clearAllMocks();
  deleteArtist.mockResolvedValue({ error: "Couldn't delete. Try again." });
});

describe("DeleteArtist", () => {
  it("is disabled with the credit message while credited", () => {
    renderWithTheme(<DeleteArtist artistId="a1" name="Halcyon" trackCount={3} albumCount={1} />);
    expect(screen.getByRole("button", { name: "Delete artist" })).toBeDisabled();
    expect(screen.getByText("This artist is credited on 3 tracks / 1 album. Remove those credits first.")).toBeInTheDocument();
  });

  it("confirms in a modal, then calls the action and shows its error", async () => {
    renderWithTheme(<DeleteArtist artistId="a1" name="Halcyon" trackCount={0} albumCount={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete artist" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete Halcyon? This can't be undone.");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteArtist).toHaveBeenCalledWith("a1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete. Try again.");
  });

  it("Cancel closes without deleting", async () => {
    renderWithTheme(<DeleteArtist artistId="a1" name="Halcyon" trackCount={0} albumCount={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete artist" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteArtist).not.toHaveBeenCalled();
  });
});
