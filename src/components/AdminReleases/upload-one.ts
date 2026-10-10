// One MP3 → R2 via a presigned PUT (same path as the upload form). Returns
// the minted key for replaceTrackAudio / addAlbumTrack.
import { audioFileError } from '@/lib/admin/rules';
import type { UploadRequest, UploadUrlsResult } from '@/lib/admin/types';

export type UploadOneDeps = {
  createUploadUrls: (files: UploadRequest[]) => Promise<UploadUrlsResult>;
  putFile: (url: string, file: File, onProgress: (fraction: number) => void) => Promise<void>;
};
export type UploadOneResult = { key: string; error: null } | { key: null; error: string };

export async function uploadOne(file: File, deps: UploadOneDeps, onProgress: (fraction: number) => void): Promise<UploadOneResult> {
  const problem = audioFileError(file);
  if (problem) return { key: null, error: problem };

  let res: UploadUrlsResult;
  try {
    res = await deps.createUploadUrls([{ clientId: 'one', name: file.name, size: file.size }]);
  } catch {
    return { key: null, error: "Couldn't reach the server. Try again." };
  }
  if (res.error !== null) return { key: null, error: res.error };

  const target = res.targets[0];
  try {
    await deps.putFile(target.url, file, onProgress);
  } catch (err) {
    return { key: null, error: err instanceof Error ? err.message : 'Upload failed.' };
  }
  return { key: target.key, error: null };
}
