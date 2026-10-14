import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/admin/peaks-actions", () => ({ getPeaksStatus: vi.fn(), getPeaksJob: vi.fn() }));
vi.mock("@/lib/peaks/compute", () => ({ storePeaks: vi.fn() }));

import { AnalyzeWaveforms, type AnalyzeDeps } from "./AnalyzeWaveforms";

const TRACKS = [{ id: "a", title: "Alpha" }, { id: "b", title: "Beta" }];

function deps(overrides: Partial<AnalyzeDeps> = {}): AnalyzeDeps {
  return {
    getPeaksStatus: vi.fn(async () => ({ status: { a: true, b: false }, error: null as null })),
    getPeaksJob: vi.fn(async (id: string) => ({ audioUrl: `https://get/${id}`, peaksUrl: `https://put/${id}`, error: null as null })),
    fetchAudio: vi.fn(async () => new Blob([new Uint8Array(4)])),
    storePeaks: vi.fn(async () => true),
    ...overrides,
  };
}

const row = (title: string) => screen.getByText(title).closest("li")!;

describe("AnalyzeWaveforms", () => {
  it("shows which tracks have waveforms", async () => {
    renderWithTheme(<AnalyzeWaveforms tracks={TRACKS} deps={deps()} />);
    await waitFor(() => expect(row("Alpha")).toHaveTextContent("has waveform"));
    expect(row("Beta")).toHaveTextContent("missing");
  });

  it("analyzes every track one at a time and marks them done", async () => {
    const d = deps();
    let inFlight = 0;
    let peak = 0;
    d.storePeaks = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return true;
    });
    renderWithTheme(<AnalyzeWaveforms tracks={TRACKS} deps={d} />);
    await userEvent.click(await screen.findByRole("button", { name: "Analyze all" }));
    await waitFor(() => expect(row("Beta")).toHaveTextContent("analyzed"));
    expect(row("Alpha")).toHaveTextContent("analyzed");
    expect(peak).toBe(1);
    expect(d.storePeaks).toHaveBeenCalledWith(expect.any(Blob), "https://put/a");
    expect(d.storePeaks).toHaveBeenCalledWith(expect.any(Blob), "https://put/b");
  });

  it("keeps going after one track fails, and disables the button while running", async () => {
    let release: () => void = () => {};
    const d = deps({
      getPeaksJob: vi.fn(async (id: string) =>
        id === "a"
          ? { audioUrl: null, peaksUrl: null, error: "Track not found." }
          : { audioUrl: "https://get/b", peaksUrl: "https://put/b", error: null as null }),
      storePeaks: vi.fn(() => new Promise<boolean>((r) => { release = () => r(true); })),
    });
    renderWithTheme(<AnalyzeWaveforms tracks={TRACKS} deps={d} />);
    const button = await screen.findByRole("button", { name: "Analyze all" });
    await userEvent.click(button);
    await waitFor(() => expect(row("Alpha")).toHaveTextContent("failed"));
    expect(button).toBeDisabled();
    release();
    await waitFor(() => expect(row("Beta")).toHaveTextContent("analyzed"));
    expect(button).not.toBeDisabled();
  });

  it("marks a track failed when its MP3 can't be fetched", async () => {
    const d = deps({ fetchAudio: vi.fn(async () => { throw new Error("403"); }) });
    renderWithTheme(<AnalyzeWaveforms tracks={[TRACKS[0]]} deps={d} />);
    await userEvent.click(await screen.findByRole("button", { name: "Analyze all" }));
    await waitFor(() => expect(row("Alpha")).toHaveTextContent("failed"));
    expect(d.storePeaks).not.toHaveBeenCalled();
  });

  it("shows the status error and still allows analyzing", async () => {
    const d = deps({ getPeaksStatus: vi.fn(async () => ({ status: null, error: "Couldn't check waveforms." })) });
    renderWithTheme(<AnalyzeWaveforms tracks={TRACKS} deps={d} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't check waveforms.");
    expect(screen.getByRole("button", { name: "Analyze all" })).not.toBeDisabled();
  });
});
