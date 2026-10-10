// src/components/AdminReleases/instant-actions.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

const KEY = "tracks/0b8c1f3e-8f2a-4d5b-9c1e-2a3b4c5d6e7f.mp3";
const replaceTrackAudio = vi.fn();
const removeTrack = vi.fn();
const restoreTrack = vi.fn();
const addAlbumTrack = vi.fn();
const createUploadUrls = vi.fn();
const putFile = vi.fn();
vi.mock("@/lib/admin/release-actions", () => ({
  replaceTrackAudio: (...a: unknown[]) => replaceTrackAudio(...a),
  removeTrack: (...a: unknown[]) => removeTrack(...a),
  restoreTrack: (...a: unknown[]) => restoreTrack(...a),
  addAlbumTrack: (...a: unknown[]) => addAlbumTrack(...a),
}));
vi.mock("@/lib/admin/actions", () => ({
  createUploadUrls: (...a: unknown[]) => createUploadUrls(...a),
  searchArtists: vi.fn(async () => ({ artists: [{ id: "a1", name: "Nova" }], error: null })),
}));
vi.mock("@/components/Upload/upload-engine", () => ({ putFile: (...a: unknown[]) => putFile(...a) }));

import { AddTrackForm } from "./AddTrackForm";
import { RemovedTracks } from "./RemovedTracks";
import { RemoveTrack } from "./RemoveTrack";
import { ReplaceAudio } from "./ReplaceAudio";

const mp3 = (name = "New_Song.mp3") => new File([new Uint8Array(10)], name, { type: "audio/mpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [replaceTrackAudio, removeTrack, restoreTrack, addAlbumTrack]) fn.mockResolvedValue({ error: null });
  createUploadUrls.mockResolvedValue({ targets: [{ clientId: "one", key: KEY, url: "https://put" }], error: null });
  putFile.mockResolvedValue(undefined);
});

describe("ReplaceAudio", () => {
  it("confirms, uploads, then replaces", async () => {
    renderWithTheme(<ReplaceAudio trackId="t1" title="One" disabled={false} />);
    await userEvent.upload(screen.getByLabelText("Replace MP3 for One"), mp3());
    expect(screen.getByRole("dialog", { name: 'Replace the MP3 for "One"?' })).toHaveTextContent("Downloads already made keep the old file");
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(putFile).toHaveBeenCalled();
    expect(replaceTrackAudio).toHaveBeenCalledWith("t1", KEY);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("MP3 replaced.");
  });

  it("clears the success line when a new file is picked", async () => {
    renderWithTheme(<ReplaceAudio trackId="t1" title="One" disabled={false} />);
    await userEvent.upload(screen.getByLabelText("Replace MP3 for One"), mp3());
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(screen.getByRole("status")).toHaveTextContent("MP3 replaced.");
    await userEvent.upload(screen.getByLabelText("Replace MP3 for One"), mp3("b.mp3"));
    expect(screen.queryByText("MP3 replaced.")).not.toBeInTheDocument();
  });

  it("rejects a non-MP3 without opening the dialog", async () => {
    renderWithTheme(<ReplaceAudio trackId="t1" title="One" disabled={false} />);
    await userEvent.upload(screen.getByLabelText("Replace MP3 for One"), mp3("a.wav"), { applyAccept: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Only MP3 files are supported.");
  });
});

describe("RemoveTrack", () => {
  it("warns that removing the last live track archives the album", async () => {
    renderWithTheme(<RemoveTrack trackId="t1" title="One" isLastLive disabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove One" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("the album will be archived too");
    await userEvent.click(screen.getByRole("button", { name: "Remove track" }));
    expect(removeTrack).toHaveBeenCalledWith("t1");
  });

  it("is disabled while locked", () => {
    renderWithTheme(<RemoveTrack trackId="t1" title="One" isLastLive={false} disabled />);
    expect(screen.getByRole("button", { name: "Remove One" })).toBeDisabled();
  });
});

describe("RemovedTracks", () => {
  it("restores a removed track; renders nothing when empty", async () => {
    const { container, rerender } = renderWithTheme(<RemovedTracks tracks={[]} disabled={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RemovedTracks tracks={[{ id: "t2", title: "Gone", artists: [], archived: true }]} disabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Restore Gone" }));
    expect(restoreTrack).toHaveBeenCalledWith("t2");
  });
});

describe("AddTrackForm", () => {
  it("validates, prefills the title from the filename, uploads, and adds", async () => {
    renderWithTheme(<AddTrackForm releaseId="r1" disabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Add track" }));
    expect(screen.getByText("Choose an MP3.")).toBeInTheDocument();
    expect(addAlbumTrack).not.toHaveBeenCalled();

    await userEvent.upload(screen.getByLabelText("MP3 file"), mp3());
    expect(screen.getByLabelText("Track title")).toHaveValue("New Song");
    await userEvent.type(screen.getByRole("combobox", { name: "Artists" }), "Nova");
    await userEvent.click(await screen.findByRole("option", { name: "Nova" }));
    await userEvent.click(screen.getByRole("button", { name: "Add track" }));
    expect(addAlbumTrack).toHaveBeenCalledWith("r1", { title: "New Song", audioKey: KEY, artists: [{ id: "a1" }] });
    expect(screen.getByLabelText("Track title")).toHaveValue("");
  });
});
