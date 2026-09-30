// Browser-side publish pipeline: validate → get presigned URLs → PUT files to
// R2 (with progress) → call publishRelease. Dependencies are injected so the
// whole flow is unit-testable without a network.

import { AUDIO_CONTENT_TYPE } from "@/lib/admin/rules";
import type { PublishResult, ReleasePayload, UploadRequest, UploadUrlsResult } from "@/lib/admin/types";
import { buildPayload, hasErrors, validate, type UploadAction, type UploadState } from "./upload-reducer";

export const UPLOAD_CONCURRENCY = 2;

// XMLHttpRequest rather than fetch: fetch has no upload-progress events.
export function putFile(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", AUDIO_CONTENT_TYPE); // must match the signed header
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed (network)"));
    xhr.send(file);
  });
}

// Runs `worker` over `items` with at most `limit` in flight. After the first
// failure no new items start; in-flight ones settle, then it rejects.
export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: unknown = null;
  async function lane() {
    while (failure === null && next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (err) {
        if (failure === null) failure = err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failure !== null) throw failure;
}

export type PublishDeps = {
  createUploadUrls: (files: UploadRequest[]) => Promise<UploadUrlsResult>;
  putFile: (url: string, file: File, onProgress: (fraction: number) => void) => Promise<void>;
  publishRelease: (payload: ReleasePayload) => Promise<PublishResult | undefined>;
  dispatch: (action: UploadAction) => void;
};

export async function runPublish(state: UploadState, deps: PublishDeps): Promise<void> {
  if (state.publishing) return;
  if (hasErrors(validate(state))) {
    deps.dispatch({ type: "showErrors" });
    return;
  }
  deps.dispatch({ type: "publishStarted" });

  // Files that already finished uploading (a previous attempt) are reused.
  const keys: Record<string, string> = {};
  for (const t of state.tracks) {
    if (t.upload.status === "done" && t.upload.key) keys[t.clientId] = t.upload.key;
  }
  const toUpload = state.tracks.filter((t) => !keys[t.clientId]);

  if (toUpload.length > 0) {
    const res = await deps.createUploadUrls(
      toUpload.map((t) => ({ clientId: t.clientId, name: t.file!.name, size: t.file!.size })),
    );
    if (res.error !== null) {
      deps.dispatch({ type: "publishFailed", error: res.error });
      return;
    }
    const files = new Map(toUpload.map((t) => [t.clientId, t.file!]));
    try {
      await runPool(res.targets, UPLOAD_CONCURRENCY, async (target) => {
        deps.dispatch({ type: "uploadStarted", clientId: target.clientId });
        try {
          await deps.putFile(target.url, files.get(target.clientId)!, (progress) =>
            deps.dispatch({ type: "uploadProgress", clientId: target.clientId, progress }),
          );
        } catch (err) {
          deps.dispatch({ type: "uploadFailed", clientId: target.clientId, error: "Upload failed." });
          throw err;
        }
        keys[target.clientId] = target.key;
        deps.dispatch({ type: "uploadDone", clientId: target.clientId, key: target.key });
      });
    } catch {
      deps.dispatch({ type: "publishFailed", error: "Some files didn't upload. Publish again to retry." });
      return;
    }
  }

  // On success publishRelease redirects to /feed and this never resumes.
  const result = await deps.publishRelease(buildPayload(state, keys));
  if (result?.error) deps.dispatch({ type: "publishFailed", error: result.error });
}
