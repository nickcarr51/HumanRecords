import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

const push = vi.fn();
const createUploadUrls = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/admin/actions", () => ({
  searchArtists: vi.fn(async () => ({ artists: [], error: null })),
  createUploadUrls: (...a: unknown[]) => createUploadUrls(...a),
  publishRelease: vi.fn(),
}));

import { UploadForm } from "./UploadForm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("UploadForm", () => {
  it("starts as a single with one track and no album fields", () => {
    renderWithTheme(<UploadForm />);
    expect(screen.getByRole("radio", { name: "Single" })).toBeChecked();
    expect(screen.queryByLabelText("Album title")).toBeNull();
    expect(screen.getAllByLabelText("Track title")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "+ Add track" })).toBeNull();
  });

  it("album mode shows album fields and lets you add tracks", () => {
    renderWithTheme(<UploadForm />);
    fireEvent.click(screen.getByRole("radio", { name: "Album" }));
    expect(screen.getByLabelText("Album title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Add track" }));
    expect(screen.getAllByLabelText("Track title")).toHaveLength(2);
    expect(screen.getByText("Track 2")).toBeInTheDocument();
  });

  it("asks before switching album → single would drop tracks, and respects Cancel", () => {
    renderWithTheme(<UploadForm />);
    fireEvent.click(screen.getByRole("radio", { name: "Album" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add track" }));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("radio", { name: "Single" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getAllByLabelText("Track title")).toHaveLength(2);
  });

  it("Publish on an empty form shows field errors and uploads nothing", () => {
    renderWithTheme(<UploadForm />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Choose an MP3.")).toBeInTheDocument();
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Add at least one artist.")).toBeInTheDocument();
    expect(createUploadUrls).not.toHaveBeenCalled();
  });

  it("choosing an mp3 fills the title; a wav shows an error", () => {
    renderWithTheme(<UploadForm />);
    const fileInput = screen.getByLabelText("MP3 file");
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "My_Song.mp3")] } });
    expect(screen.getByLabelText("Track title")).toHaveValue("My Song");
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "bad.wav")] } });
    expect(screen.getByText("Only MP3 files are supported.")).toBeInTheDocument();
  });

  it("Clear all asks, then resets", () => {
    renderWithTheme(<UploadForm />);
    fireEvent.change(screen.getByLabelText("Track title"), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByLabelText("Track title")).toHaveValue("");
  });

  it("Cancel goes to /admin, confirming only when there's something to lose", () => {
    renderWithTheme(<UploadForm />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/admin");
    fireEvent.change(screen.getByLabelText("Track title"), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.confirm).toHaveBeenCalled();
  });

  it("locks the form while publishing", async () => {
    createUploadUrls.mockReturnValue(new Promise(() => {})); // never settles
    renderWithTheme(<UploadForm />);
    fireEvent.change(screen.getByLabelText("MP3 file"), {
      target: { files: [new File(["x"], "My_Song.mp3", { type: "audio/mpeg" })] },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Daye" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: 'Create "Daye"' }));

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(createUploadUrls).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByLabelText("Track title")).toBeDisabled();
    expect(screen.getByLabelText("MP3 file")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Album" })).toBeDisabled();
  });
});
