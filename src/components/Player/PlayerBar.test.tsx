import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("./PlayerProvider", () => ({ usePlayer: vi.fn() }));
import { usePlayer } from "./PlayerProvider";
import { PlayerBar } from "./PlayerBar";

const mockUse = vi.mocked(usePlayer);

function state(overrides: Partial<ReturnType<typeof usePlayer>> = {}) {
  return {
    queue: [{ id: "t1", title: "One", artistName: "Alpha" }],
    currentIndex: 0,
    currentTrack: { id: "t1", title: "One", artistName: "Alpha" },
    isPlaying: false,
    currentTime: 0,
    duration: 100,
    status: "idle" as const,
    playQueue: vi.fn(),
    toggle: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    seek: vi.fn(),
    ...overrides,
  };
}

describe("PlayerBar", () => {
  it("renders nothing when the queue is empty", () => {
    mockUse.mockReturnValue(state({ queue: [], currentTrack: null }));
    const { container } = renderWithTheme(<PlayerBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current track and artist", () => {
    mockUse.mockReturnValue(state());
    renderWithTheme(<PlayerBar />);
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("play/pause, next, prev call the player actions", () => {
    const s = state();
    mockUse.mockReturnValue(s);
    renderWithTheme(<PlayerBar />);
    fireEvent.click(screen.getByRole("button", { name: /play|pause/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(s.toggle).toHaveBeenCalled();
    expect(s.next).toHaveBeenCalled();
    expect(s.prev).toHaveBeenCalled();
  });

  it("shows the play control when paused and the pause control when playing", () => {
    mockUse.mockReturnValue(state({ isPlaying: false }));
    const { rerender } = renderWithTheme(<PlayerBar />);
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument();

    mockUse.mockReturnValue(state({ isPlaying: true }));
    rerender(<PlayerBar />);
    expect(screen.getByRole("button", { name: /^pause$/i })).toBeInTheDocument();
  });

  it("scrubbing calls seek", () => {
    const s = state();
    mockUse.mockReturnValue(s);
    renderWithTheme(<PlayerBar />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "42" } });
    expect(s.seek).toHaveBeenCalledWith(42);
  });

  it("shows an error message when status is error", () => {
    mockUse.mockReturnValue(state({ status: "error" }));
    renderWithTheme(<PlayerBar />);
    expect(screen.getByText(/couldn.t play/i)).toBeInTheDocument();
  });

  it("guards slider max against NaN duration", () => {
    mockUse.mockReturnValue(state({ duration: NaN }));
    renderWithTheme(<PlayerBar />);
    expect(screen.getByRole("slider")).toHaveAttribute("max", "0");
  });

  it("guards slider max against Infinity duration", () => {
    mockUse.mockReturnValue(state({ duration: Infinity }));
    renderWithTheme(<PlayerBar />);
    expect(screen.getByRole("slider")).toHaveAttribute("max", "0");
  });
});
