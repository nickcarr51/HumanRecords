import type { UploadRequest } from "@/lib/admin/types";
import { describe, expect, it, vi } from "vitest";
import { runPool, runPublish, type PublishDeps } from "./upload-engine";
import {
  createInitialState,
  newChip,
  uploadReducer as r,
  type UploadAction,
  type UploadState,
} from "./upload-reducer";

const mp3 = (name: string) => new File([new Uint8Array(10)], name, { type: "audio/mpeg" });

function readyAlbum(): UploadState {
  let s = r(createInitialState("t1"), { type: "setKind", kind: "album" });
  s = r(s, { type: "addTrack", clientId: "t2" });
  s = r(s, { type: "setAlbumTitle", title: "LP" });
  for (const id of ["t1", "t2"]) {
    s = r(s, { type: "setTrackFile", clientId: id, file: mp3(`${id}.mp3`) });
    s = r(s, { type: "addTrackArtist", clientId: id, chip: newChip("Daye") });
  }
  return s;
}

function deps(overrides: Partial<PublishDeps> = {}) {
  const actions: UploadAction[] = [];
  const d: PublishDeps = {
    createUploadUrls: vi.fn(async (files: UploadRequest[]) => ({
      targets: files.map((f) => ({ clientId: f.clientId, key: `tracks/${f.clientId}.mp3`, url: `https://up/${f.clientId}` })),
      error: null,
    })),
    putFile: vi.fn(async (_url, _file, onProgress) => onProgress(1)),
    publishRelease: vi.fn(async () => undefined),
    dispatch: (a) => actions.push(a),
    ...overrides,
  };
  return { d, actions };
}

describe("runPool", () => {
  it("never runs more than `limit` workers at once and runs every item", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((res) => setTimeout(res, 1));
      done.push(n);
      running--;
    });
    expect(peak).toBe(2);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("stops starting new work after a failure and rejects", async () => {
    const started: number[] = [];
    await expect(
      runPool([1, 2, 3, 4], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });
});

describe("runPublish", () => {
  it("shows errors and does nothing else when the form is invalid", async () => {
    const { d, actions } = deps();
    await runPublish(createInitialState("t1"), d);
    expect(actions).toEqual([{ type: "showErrors" }]);
    expect(d.createUploadUrls).not.toHaveBeenCalled();
  });

  it("does nothing while already publishing (double-click)", async () => {
    const { d, actions } = deps();
    await runPublish({ ...readyAlbum(), publishing: true }, d);
    expect(actions).toEqual([]);
    expect(d.createUploadUrls).not.toHaveBeenCalled();
  });

  it("uploads every file then publishes the payload with the new keys", async () => {
    const { d, actions } = deps();
    await runPublish(readyAlbum(), d);
    expect(actions[0]).toEqual({ type: "publishStarted" });
    expect(d.createUploadUrls).toHaveBeenCalledWith([
      { clientId: "t1", name: "t1.mp3", size: 10 },
      { clientId: "t2", name: "t2.mp3", size: 10 },
    ]);
    expect(actions).toContainEqual({ type: "uploadDone", clientId: "t1", key: "tracks/t1.mp3" });
    expect(d.publishRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "album",
        tracks: [
          expect.objectContaining({ audioKey: "tracks/t1.mp3" }),
          expect.objectContaining({ audioKey: "tracks/t2.mp3" }),
        ],
      }),
    );
  });

  it("on retry, only uploads tracks without a finished upload", async () => {
    const { d } = deps();
    const s = r(readyAlbum(), { type: "uploadDone", clientId: "t1", key: "tracks/already.mp3" });
    await runPublish(s, d);
    expect(d.createUploadUrls).toHaveBeenCalledWith([{ clientId: "t2", name: "t2.mp3", size: 10 }]);
    expect(d.publishRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: [
          expect.objectContaining({ audioKey: "tracks/already.mp3" }),
          expect.objectContaining({ audioKey: "tracks/t2.mp3" }),
        ],
      }),
    );
  });

  it("stops and reports when an upload fails", async () => {
    const { d, actions } = deps({
      putFile: vi.fn(async (url: string) => {
        if (url.endsWith("t2")) throw new Error("network");
      }),
    });
    await runPublish(readyAlbum(), d);
    expect(actions).toContainEqual({ type: "uploadFailed", clientId: "t2", error: "Upload failed." });
    expect(actions.at(-1)).toEqual({
      type: "publishFailed",
      error: "Some files didn't upload. Publish again to retry.",
    });
    expect(d.publishRelease).not.toHaveBeenCalled();
  });

  it("reports createUploadUrls and publishRelease errors", async () => {
    const a = deps({ createUploadUrls: vi.fn(async () => ({ targets: null, error: "Only label members can do this." })) });
    await runPublish(readyAlbum(), a.d);
    expect(a.actions.at(-1)).toEqual({ type: "publishFailed", error: "Only label members can do this." });

    const b = deps({ publishRelease: vi.fn(async () => ({ error: "Track 2 needs a title." })) });
    await runPublish(readyAlbum(), b.d);
    expect(b.actions.at(-1)).toEqual({ type: "publishFailed", error: "Track 2 needs a title." });
  });
});
