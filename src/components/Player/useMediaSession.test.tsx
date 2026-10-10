import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/storage/actions", () => ({ getTrackStreamUrl: vi.fn() }));
vi.mock("@/lib/feed/actions", () => ({ loadFeedPage: vi.fn(), continueAfterAlbum: vi.fn() }));
import { getTrackStreamUrl } from "@/lib/storage/actions";
import { PlayerProvider, usePlayer } from "./PlayerProvider";

const TRACKS = [
  { id: "t1", title: "One", artistName: "Alpha, Beta" },
  { id: "t2", title: "Two", artistName: "Gamma" },
];

type Handler = (details: { seekTime?: number }) => void;
let handlers: Record<string, Handler | null>;
let session: { metadata: unknown; playbackState: string; setActionHandler: ReturnType<typeof vi.fn>; setPositionState: ReturnType<typeof vi.fn> };

class FakeMetadata {
  constructor(public init: MediaMetadataInit) {}
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
});

beforeEach(() => {
  vi.mocked(getTrackStreamUrl).mockImplementation(async (id: string) => ({ url: `https://signed.example/${id}`, error: null }));
  handlers = {};
  session = {
    metadata: null,
    playbackState: "none",
    setActionHandler: vi.fn((action: string, h: Handler | null) => {
      handlers[action] = h;
    }),
    setPositionState: vi.fn(),
  };
  Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
  vi.stubGlobal("MediaMetadata", FakeMetadata);
});

afterEach(() => {
  delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
  vi.unstubAllGlobals();
});

function Harness() {
  const p = usePlayer();
  return (
    <div>
      <span data-testid="title">{p.currentTrack?.title ?? "none"}</span>
      <button onClick={() => p.playQueue(TRACKS, 0)}>play</button>
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

describe("Media Session", () => {
  it("sets title, artist and the logo artwork for the current track", async () => {
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    await waitFor(() =>
      expect((session.metadata as FakeMetadata).init).toEqual({
        title: "One",
        artist: "Alpha, Beta",
        artwork: [{ src: "/human_records_main_logo.png", sizes: "1440x1440", type: "image/png" }],
      }),
    );
  });

  it("registers lock-screen handlers; nexttrack advances", async () => {
    renderPlayer();
    for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekto"]) {
      expect(handlers[a]).toBeTypeOf("function");
    }
    await userEvent.click(screen.getByText("play"));
    act(() => handlers.nexttrack!({}));
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Two"));
  });

  it("seekto moves the audio position", async () => {
    const { container } = renderPlayer();
    await userEvent.click(screen.getByText("play"));
    act(() => handlers.seekto!({ seekTime: 42 }));
    expect(container.querySelector("audio")!.currentTime).toBe(42);
  });

  it("does nothing when the browser has no Media Session", async () => {
    delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
    renderPlayer();
    await userEvent.click(screen.getByText("play"));
    expect(screen.getByTestId("title")).toHaveTextContent("One");
  });
});
