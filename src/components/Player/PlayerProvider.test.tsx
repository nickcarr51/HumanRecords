import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/storage/actions", () => ({ getTrackStreamUrl: vi.fn() }));
import { getTrackStreamUrl } from "@/lib/storage/actions";
import { PlayerProvider, usePlayer, toPlayerTrack } from "./PlayerProvider";

const mockGet = vi.mocked(getTrackStreamUrl);

beforeAll(() => {
  // jsdom does not implement media playback.
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ url: "https://signed.example/audio", error: null });
});

const TRACKS = [
  { id: "t1", title: "One", artistName: "Alpha" },
  { id: "t2", title: "Two", artistName: "Beta" },
];

function Harness() {
  const p = usePlayer();
  return (
    <div>
      <span data-testid="title">{p.currentTrack?.title ?? "none"}</span>
      <span data-testid="status">{p.status}</span>
      <button onClick={() => p.playQueue(TRACKS, 0)}>play</button>
      <button onClick={() => p.next()}>next</button>
      <button onClick={() => p.prev()}>prev</button>
      <button onClick={() => p.toggle()}>toggle</button>
    </div>
  );
}

function renderPlayer() {
  return renderWithTheme(
    <PlayerProvider>
      <Harness />
    </PlayerProvider>,
  );
}

describe("toPlayerTrack", () => {
  it("joins artist names and falls back to Unknown Artist", () => {
    expect(toPlayerTrack({ id: "a", title: "x", artistNames: ["A", "B"] }).artistName).toBe("A, B");
    expect(toPlayerTrack({ id: "a", title: "x", artistNames: [] }).artistName).toBe("Unknown Artist");
  });
});

describe("PlayerProvider", () => {
  it("playQueue sets the current track and requests its signed URL", async () => {
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    expect(screen.getByTestId("title")).toHaveTextContent("One");
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));
  });

  it("next advances to the following track and re-signs", async () => {
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await userEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("title")).toHaveTextContent("Two");
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));
  });

  it("sets status=error when signing fails (never stuck on loading)", async () => {
    mockGet.mockResolvedValue({ url: null, error: "Track not found." });
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
  });

  it("does not hang on loading when autoplay is blocked (play rejects)", async () => {
    (window.HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    // Resolves off "loading": paused but ready, not error.
    await waitFor(() =>
      expect(screen.getByTestId("status")).not.toHaveTextContent("loading"),
    );
  });

  it("auto-advances to the next track when the audio element fires 'ended'", async () => {
    const { container } = renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));

    const audio = container.querySelector("audio");
    if (!audio) throw new Error("audio element not found");
    fireEvent(audio, new Event("ended"));

    expect(screen.getByTestId("title")).toHaveTextContent("Two");
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));
  });

  it("next() on the last track is a no-op", async () => {
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));
    await userEvent.click(screen.getByText("next"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));

    mockGet.mockClear();
    await userEvent.click(screen.getByText("next"));

    expect(screen.getByTestId("title")).toHaveTextContent("Two");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("toggle() plays the current track", async () => {
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));

    const play = window.HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;
    play.mockClear();
    await userEvent.click(screen.getByText("toggle"));
    expect(play).toHaveBeenCalled();
  });

  it("clears the element and toggle() is a no-op after a load error (no stale audio)", async () => {
    const { container } = renderPlayer();
    // First track loads OK and sets audio.src.
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));

    // Next track fails to sign → error branch must clear the stale src.
    mockGet.mockResolvedValue({ url: null, error: "Track not found." });
    await userEvent.click(screen.getByText("next"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));

    const audio = container.querySelector("audio");
    if (!audio) throw new Error("audio element not found");
    expect(audio.getAttribute("src")).toBeNull();

    // Pressing play/pause while errored must not resume the previous track.
    const play = window.HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;
    play.mockClear();
    await userEvent.click(screen.getByText("toggle"));
    expect(play).not.toHaveBeenCalled();
  });

  it("prev() moves to the previous track", async () => {
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));
    await userEvent.click(screen.getByText("next"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));

    mockGet.mockClear();
    await userEvent.click(screen.getByText("prev"));

    // jsdom keeps audio.currentTime at 0, so prev() takes the
    // "go to previous track" branch rather than the restart-current-track one.
    expect(screen.getByTestId("title")).toHaveTextContent("One");
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));
  });
});
