import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/storage/actions", () => ({ getTrackStreamUrl: vi.fn() }));
import { getTrackStreamUrl } from "@/lib/storage/actions";
vi.mock("@/lib/feed/actions", () => ({ loadFeedPage: vi.fn(), continueAfterRelease: vi.fn() }));
import { continueAfterRelease, loadFeedPage } from "@/lib/feed/actions";
import { PlayerProvider, usePlayer, toPlayerTrack } from "./PlayerProvider";
import type { PlayerTrack, QueueSource } from "./queue";

const mockGet = vi.mocked(getTrackStreamUrl);
const mockLoad = vi.mocked(loadFeedPage);
const mockAfterRelease = vi.mocked(continueAfterRelease);

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
  mockAfterRelease.mockReset();
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
      <span data-testid="source-json">{JSON.stringify(p.source)}</span>
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
  it("plays the signed R2 URL directly on a CORS-enabled audio element", async () => {
    const { container } = renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(container.querySelector("audio")?.getAttribute("src")).toBe("https://signed.example/t1"));
    // crossOrigin is what lets Web Audio read the signal for the waveform/particles.
    expect(container.querySelector("audio")?.crossOrigin).toBe("anonymous");
  });

  it("skips CORS mode on touch devices so a plain <audio> keeps playing in the background", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)", addEventListener() {}, removeEventListener() {} }));
    try {
      const { container } = renderPlayer();
      await userEvent.click(screen.getByText("play"));
      await waitFor(() => expect(container.querySelector("audio")?.getAttribute("src")).toBe("https://signed.example/t1"));
      expect(container.querySelector("audio")?.hasAttribute("crossorigin")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
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

  it("treats a rejected stream-URL call like a signing error (no stale audio, no unhandled rejection)", async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === "t2") throw new Error("network lost");
      return { url: `https://signed.example/${id}`, error: null };
    });
    const { container } = renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(container.querySelector("audio")?.getAttribute("src")).toBe("https://signed.example/t1"));

    await userEvent.click(screen.getByText("next"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    expect(container.querySelector("audio")?.getAttribute("src")).toBeNull();

    const play = window.HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;
    play.mockClear();
    await userEvent.click(screen.getByText("toggle"));
    expect(play).not.toHaveBeenCalled();
  });

  it("does not skip loading a track whose earlier moveTo was superseded before its effect ran", async () => {
    const FOUR = [...TRACKS, { id: "t3", title: "Three", artistName: "Gamma" }, { id: "t4", title: "Four", artistName: "Delta" }];
    renderPlayer({ tracks: FOUR });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2")); // t2 pre-signed
    await new Promise((r) => setTimeout(r, 0));

    // Two nexts in one batch: t2 starts from its pre-signed URL (startedRef=t2) but
    // the render lands directly on t3, so the effect never sees t2.
    act(() => {
      fireEvent.click(screen.getByText("next"));
      fireEvent.click(screen.getByText("next"));
    });
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Three"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t4")); // t4 pre-signed replaces t2's URL
    await new Promise((r) => setTimeout(r, 0));

    mockGet.mockClear();
    await userEvent.click(screen.getByText("prev")); // back to t2, no pre-signed URL: must load it
    expect(screen.getByTestId("title")).toHaveTextContent("Two");
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));
  });

  it("a superseded track's play() rejection does not flip the status while the next track loads", async () => {
    const THREE = [...TRACKS, { id: "t3", title: "Three", artistName: "Gamma" }];
    let resolveC!: (v: Awaited<ReturnType<typeof getTrackStreamUrl>>) => void;
    mockGet.mockImplementation(async (id: string) => {
      if (id === "t3") return new Promise((r) => (resolveC = r)); // C is never pre-signed in time
      return { url: `https://signed.example/${id}`, error: null };
    });
    renderPlayer({ tracks: THREE });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2")); // B pre-signed
    await new Promise((r) => setTimeout(r, 0));

    const play = window.HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;
    let rejectB!: (e: Error) => void;
    play.mockImplementationOnce(() => new Promise((_, rej) => (rejectB = rej))); // B's play() stays pending

    await userEvent.click(screen.getByText("next")); // B starts from its pre-signed URL
    await userEvent.click(screen.getByText("next")); // C: no URL yet
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Three"));
    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    await act(async () => {
      rejectB(new DOMException("interrupted", "AbortError"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    await act(async () => resolveC({ url: "https://signed.example/t3", error: null }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("playing"));
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

    // The appended page's first track gets pre-signed while t1 plays.
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));
    await new Promise((r) => setTimeout(r, 0));
    mockGet.mockClear();

    const audio = endTrack(container);
    // Set synchronously inside the 'ended' handler, from the pre-signed URL.
    expect(audio.getAttribute("src")).toBe("https://signed.example/t2");
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Two"));
    expect(mockGet).not.toHaveBeenCalledWith("t2");
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

  it("keeps the next track's pre-signed URL when an older pre-sign resolves late", async () => {
    const THREE = [...TRACKS, { id: "t3", title: "Three", artistName: "Gamma" }];
    let resolveB!: (v: Awaited<ReturnType<typeof getTrackStreamUrl>>) => void;
    let bCalls = 0;
    mockGet.mockImplementation(async (id: string) => {
      // The first sign of t2 (its pre-sign while t1 plays) is slow.
      if (id === "t2" && bCalls++ === 0) return new Promise((r) => (resolveB = r));
      return { url: `https://signed.example/${id}`, error: null };
    });
    const { container } = renderPlayer({ tracks: THREE });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t2"));

    await userEvent.click(screen.getByText("next"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t3")); // C pre-signed
    await new Promise((r) => setTimeout(r, 0));
    resolveB({ url: "https://signed.example/t2-late", error: null }); // B's late pre-sign
    await new Promise((r) => setTimeout(r, 0));
    mockGet.mockClear();

    const audio = endTrack(container);
    expect(audio.getAttribute("src")).toBe("https://signed.example/t3");
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Three"));
    expect(mockGet).not.toHaveBeenCalledWith("t3");
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

  it("background prefetch stops after 3 consecutive fetches that add nothing", async () => {
    mockLoad.mockResolvedValue({ tracks: ONE_PAGE1, page: 2, hasMore: true, error: null });
    renderPlayer({ tracks: ONE_PAGE1, source: feedSource(true) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockLoad).toHaveBeenCalledTimes(3);
  });

  it("next still fetches and plays a new track after the prefetch cap", async () => {
    mockLoad.mockResolvedValue({ tracks: ONE_PAGE1, page: 2, hasMore: true, error: null });
    renderPlayer({ tracks: ONE_PAGE1, source: feedSource(true) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 50));

    mockLoad.mockResolvedValue({ tracks: PAGE2, page: 3, hasMore: false, error: null });
    await userEvent.click(screen.getByText("next"));
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Two"));
  });

  it("an album-page queue continues into the feed after its last track", async () => {
    mockAfterRelease.mockResolvedValue({ tracks: [{ id: "f1", title: "Feed One", artistName: "C", page: 3 }], page: 3, hasMore: false, error: null });
    const { container } = renderPlayer({
      tracks: [{ id: "a1", title: "Album One", artistName: "B" }],
      source: { kind: "album", albumId: "al1" },
    });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockAfterRelease).toHaveBeenCalledWith({ kind: "album", albumId: "al1" }));
    await waitFor(() => expect(screen.getByTestId("source")).toHaveTextContent("feed"));

    endTrack(container);
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Feed One"));
  });

  const SEARCH_LAST = [{ id: "s1", title: "Search One", artistName: "A", page: 1, from: { kind: "single" as const, trackId: "s1" } }];
  const searchSource: QueueSource = { kind: "feed", q: "wav", lastPage: 1, hasMore: false };
  const CONTINUATION = [{ id: "f1", title: "Feed One", artistName: "C", page: 4, from: { kind: "single" as const, trackId: "f1" } }];

  it("a finished search queue continues into the main feed after its last release (next)", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof continueAfterRelease>>) => void;
    mockAfterRelease.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPlayer({ tracks: SEARCH_LAST, source: searchSource });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockAfterRelease).toHaveBeenCalledWith({ kind: "single", trackId: "s1" }));

    // Pressed before the continuation arrives: next waits for it, then plays it.
    await userEvent.click(screen.getByText("next"));
    resolve({ tracks: CONTINUATION, page: 4, hasMore: true, error: null });
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Feed One"));
    expect(mockAfterRelease).toHaveBeenCalledTimes(1);
    // Later pages come from the main feed, not the search.
    await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ q: "", page: 5 }));
  });

  it("prefetches a search queue's continuation and starts it from the pre-signed URL on 'ended'", async () => {
    mockAfterRelease.mockResolvedValue({ tracks: CONTINUATION, page: 4, hasMore: true, error: null });
    const { container } = renderPlayer({ tracks: SEARCH_LAST, source: searchSource });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockAfterRelease).toHaveBeenCalledWith({ kind: "single", trackId: "s1" }));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));
    // After the continuation the queue's source is the plain feed.
    expect(JSON.parse(screen.getByTestId("source-json").textContent!)).toEqual({ kind: "feed", q: "", lastPage: 4, hasMore: true });

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("f1"));
    await new Promise((r) => setTimeout(r, 0));
    mockGet.mockClear();

    const audio = endTrack(container);
    expect(audio.getAttribute("src")).toBe("https://signed.example/f1");
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Feed One"));
    expect(mockGet).not.toHaveBeenCalledWith("f1");
  });

  it("a finished search queue whose last track has no release ref just ends", async () => {
    const { container } = renderPlayer({ tracks: ONE_PAGE1, source: searchSource });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("t1"));
    endTrack(container);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("title")).toHaveTextContent("One");
    expect(mockAfterRelease).not.toHaveBeenCalled();
  });

  it("a finished plain-feed queue still stops at the end (no continuation)", async () => {
    const { container } = renderPlayer({ tracks: SEARCH_LAST, source: feedSource(false) });
    await userEvent.click(screen.getByText("play"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("s1"));
    endTrack(container);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("title")).toHaveTextContent("Search One");
    expect(mockAfterRelease).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
