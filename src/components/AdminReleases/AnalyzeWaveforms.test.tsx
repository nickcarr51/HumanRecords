import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/admin/peaks-actions", () => ({ getPeaksStatus: vi.fn(), getPeaksJob: vi.fn() }));
vi.mock("@/lib/peaks/compute", () => ({ storePeaks: vi.fn() }));

import { AnalyzeWaveforms, type AnalyzeDeps } from "./AnalyzeWaveforms";

const TRACKS = [{ id: "a", title: "Alpha", audioKey: "tracks/a.mp3" }, { id: "b", title: "Beta", audioKey: "tracks/b.mp3" }];

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
  it("re-checks a track whose MP3 was replaced (same id, new audio key)", async () => {
    const d = deps({
      getPeaksStatus: vi.fn()
        .mockResolvedValueOnce({ status: { a: true, b: false }, error: null })
        .mockResolvedValueOnce({ status: { a: false, b: false }, error: null }),
    });
    const view = renderWithTheme(<AnalyzeWaveforms tracks={TRACKS} deps={d} />);
    await waitFor(() => expect(row("Alpha")).toHaveTextContent("has waveform"));
    view.rerender(<AnalyzeWaveforms tracks={[{ ...TRACKS[0], audioKey: "tracks/a2.mp3" }, TRACKS[1]]} deps={d} />);
    await waitFor(() => expect(row("Alpha")).toHaveTextContent("missing"));
    expect(d.getPeaksStatus).toHaveBeenCalledTimes(2);
  });

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
  it("ignores a late status response once a run has started", async () => {
    let resolveStatus: (v: { status: Record<string, boolean>; error: null }) => void = () => {};
    const d = deps({
      getPeaksStatus: vi.fn(() => new Promise<{ status: Record<string, boolean>; error: null }>((r) => { resolveStatus = r; })),
    });
    renderWithTheme(<AnalyzeWaveforms tracks={[TRACKS[0]]} deps={d} />);
    await userEvent.click(screen.getByRole("button", { name: "Analyze all" }));
    await waitFor(() => expect(row("Alpha")).toHaveTextContent("analyzed"));
    resolveStatus({ status: { a: false }, error: null });
    await new Promise((r) => setTimeout(r, 5));
    expect(row("Alpha")).toHaveTextContent("analyzed");
  });

  it("stops starting new tracks after unmount", async () => {
    let release: () => void = () => {};
    const d = deps({
      storePeaks: vi.fn(() => new Promise<boolean>((r) => { release = () => r(true); })),
    });
    const { unmount } = renderWithTheme(<AnalyzeWaveforms tracks={TRACKS} deps={d} />);
    await userEvent.click(await screen.findByRole("button", { name: "Analyze all" }));
    await waitFor(() => expect(d.storePeaks).toHaveBeenCalledTimes(1));
    unmount();
    release();
    await new Promise((r) => setTimeout(r, 5));
    expect(d.getPeaksJob).not.toHaveBeenCalledWith("b");
  });

  it("shows the alert and leaves no row on 'checking' when the status call rejects", async () => {
    renderWithTheme(<AnalyzeWaveforms tracks={TRACKS} deps={deps({ getPeaksStatus: vi.fn(async () => { throw new Error("boom"); }) })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't check waveforms.");
    expect(row("Alpha")).not.toHaveTextContent("checking");
    expect(row("Beta")).not.toHaveTextContent("checking");
  });

  it("gives a track added after mount a real status", async () => {
    type Status = Awaited<ReturnType<AnalyzeDeps["getPeaksStatus"]>>;
    const resolvers: ((v: Status) => void)[] = [];
    const d = deps({ getPeaksStatus: vi.fn(() => new Promise<Status>((r) => { resolvers.push(r); })) });
    const { rerender } = renderWithTheme(<AnalyzeWaveforms tracks={TRACKS} deps={d} />);
    rerender(<AnalyzeWaveforms tracks={[...TRACKS, { id: "c", title: "Gamma", audioKey: "tracks/c.mp3" }]} deps={d} />);
    await waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]({ status: { a: true, b: false, c: true }, error: null });
    await waitFor(() => expect(row("Gamma")).toHaveTextContent("has waveform"));
  });
});
