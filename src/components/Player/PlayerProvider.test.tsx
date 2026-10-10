import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/storage/actions", () => ({ getTrackStreamUrl: vi.fn() }));
import { getTrackStreamUrl } from "@/lib/storage/actions";
vi.mock("@/lib/feed/actions", () => ({ loadFeedPage: vi.fn(), continueAfterAlbum: vi.fn() }));
import { continueAfterAlbum, loadFeedPage } from "@/lib/feed/actions";
import { PlayerProvider, usePlayer, toPlayerTrack } from "./PlayerProvider";
import type { PlayerTrack, QueueSource } from "./queue";

const mockGet = vi.mocked(getTrackStreamUrl);
const mockLoad = vi.mocked(loadFeedPage);
const mockAfterAlbum = vi.mocked(continueAfterAlbum);

beforeAll(() => {
  // jsdom does not implement media playback.
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation(async (id: string) => ({ url: `https://signed.example/${id}`, error: null }));
  // clearAllMocks keeps return values; reset so one test's deferred page can't leak into the next.
  mockLoad.mockReset();
  mockAfterAlbum.mockReset();
});

const TRACKS = [
  { id: "t1", title: "One", artistName: "Alpha" },
  { id: "t2", title: "Two", artistName: "Beta" },
];

function Harness({ tracks = TRACKS, source }: { tracks?: PlayerTrack[]; source?: QueueSource }) {
  const p = usePlayer();
  return (
    <div>
      <span data-testid="title">{p.currentTrack?.title ?? "none"}</span>
      <span data-testid="status">{p.status}</span>
      <span data-testid="count">{p.queue.length}</span>
      <span data-testid="source">{p.source.kind}</span>
      <button onClick={() => p.playQueue(tracks, 0, source)}>play</button>
      <button onClick={() => p.playQueue(TRACKS, 0)}>play-other</button>
      <button onClick={() => p.next()}>next</button>
      <button onClick={() => p.prev()}>prev</button>
      <button onClick={() => p.toggle()}>toggle</button>
    </div>
  );
}

function renderPlayer(props: { tracks?: PlayerTrack[]; source?: QueueSource } = {}) {
  return renderWithTheme(
    <PlayerProvider>
      <Harness {...props} />
    </PlayerProvider>,
  );
}

function endTrack(container: HTMLElement) {
  const audio = container.querySelector("audio");
  if (!audio) throw new Error("audio element not found");
  fireEvent(audio, new Event("ended"));
  return audio;
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
    mockGet.mockImplementation(async (id: string) =>
      id === "t2" ? { url: null, error: "Track not found." } : { url: `https://signed.example/${id}`, error: null },
    );
    const { container } = renderPlayer();
    // First track loads OK and sets audio.src.
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));

    // Next track fails to sign → error branch must clear the stale src.
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

const ONE_PAGE1 = [{ id: "t1", title: "One", artistName: "Alpha", page: 1 }];
const PAGE2 = [{ id: "t2", title: "Two", artistName: "Beta", page: 2 }];
const feedSource = (hasMore: boolean): QueueSource => ({ kind: "feed", q: "", lastPage: 1, hasMore });

describe("PlayerProvider paging", () => {
  it("prefetches the next page when the last loaded track starts, then auto-advances into it", async () => {
    mockLoad.mockResolvedValue({ tracks: PAGE2, page: 2, hasMore: false, error: null });
    const { container } = renderPlayer({ tracks: ONE_PAGE1, source: feedSource(true) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ q: "", page: 2 }));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));

    endTrack(container);
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Two"));
  });

  it("stops at the end of the last page", async () => {
    const { container } = renderPlayer({ tracks: ONE_PAGE1, source: feedSource(false) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));
    endTrack(container);
    expect(screen.getByTestId("title")).toHaveTextContent("One");
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("plays the pre-signed URL on 'ended' without signing again", async () => {
    const { container } = renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2")); // pre-sign
    await new Promise((r) => setTimeout(r, 0));
    mockGet.mockClear();

    const audio = endTrack(container);
    expect(audio.getAttribute("src")).toBe("https://signed.example/t2"); // set inside the ended handler
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Two"));
    expect(mockGet).not.toHaveBeenCalledWith("t2");
  });

  it("re-signs a pre-signed URL older than 60 minutes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      renderPlayer();
      fireEvent.click(screen.getByText("play"));
      await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));
      await new Promise((r) => setTimeout(r, 0));
      mockGet.mockClear();
      now.mockReturnValue(1_000_000 + 61 * 60 * 1000);

      fireEvent.click(screen.getByText("next"));
      await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));
    } finally {
      now.mockRestore();
    }
  });

  it("drops a page that arrives after a different queue started", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof loadFeedPage>>) => void;
    mockLoad.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPlayer({ tracks: ONE_PAGE1, source: feedSource(true) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    await userEvent.click(screen.getByText("play-other"));
    resolve({ tracks: PAGE2, page: 2, hasMore: false, error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("count")).toHaveTextContent("2"); // TRACKS only, PAGE2 not appended
    expect(screen.getByTestId("title")).toHaveTextContent("One");
  });

  it("shows an error when the next page fails, and next() retries", async () => {
    mockLoad.mockResolvedValue({ tracks: [], page: 1, hasMore: false, error: "Could not load more tracks." });
    const { container } = renderPlayer({ tracks: ONE_PAGE1, source: feedSource(true) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    endTrack(container);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));

    mockLoad.mockResolvedValue({ tracks: PAGE2, page: 2, hasMore: false, error: null });
    await userEvent.click(screen.getByText("next"));
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Two"));
  });

  it("treats a server action that throws as a failed page", async () => {
    mockLoad.mockImplementation(() => {
      throw new Error("network down");
    });
    const { container } = renderPlayer({ tracks: ONE_PAGE1, source: feedSource(true) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    endTrack(container);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
  });

  it("keeps fetching when a page adds nothing new but more pages remain", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof loadFeedPage>>) => void;
    mockLoad
      .mockReturnValueOnce(new Promise((r) => (resolve = r)))
      .mockResolvedValueOnce({ tracks: [{ id: "t3", title: "Three", artistName: "Gamma", page: 3 }], page: 3, hasMore: false, error: null });
    const { container } = renderPlayer({ tracks: ONE_PAGE1, source: feedSource(true) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ q: "", page: 2 }));

    // The track ends while page 2 is in flight; page 2 then holds only a track already queued.
    endTrack(container);
    resolve({ tracks: ONE_PAGE1, page: 2, hasMore: true, error: null });
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Three"));
    expect(mockLoad).toHaveBeenCalledWith({ q: "", page: 3 });
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it("an album-page queue continues into the feed after its last track", async () => {
    mockAfterAlbum.mockResolvedValue({ tracks: [{ id: "f1", title: "Feed One", artistName: "C", page: 3 }], page: 3, hasMore: false, error: null });
    const { container } = renderPlayer({
      tracks: [{ id: "a1", title: "Album One", artistName: "B" }],
      source: { kind: "album", albumId: "al1" },
    });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockAfterAlbum).toHaveBeenCalledWith("al1"));
    await waitFor(() => expect(screen.getByTestId("source")).toHaveTextContent("feed"));

    endTrack(container);
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Feed One"));
  });
});
