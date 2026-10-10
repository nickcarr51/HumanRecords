// src/components/AdminReleases/ReplaceAudio.tsx
'use client';

import { useState } from 'react';
import { FileInput } from '@/components/FileInput';
import { createUploadUrls } from '@/lib/admin/actions';
import { replaceTrackAudio } from '@/lib/admin/release-actions';
import { audioFileError } from '@/lib/admin/rules';
import { putFile } from '@/components/Upload/upload-engine';
import { ConfirmModal } from './ConfirmModal';
import { Status } from './releases.styles';
import { uploadOne } from './upload-one';
import { useAdminAction } from './use-admin-action';

export function ReplaceAudio({ trackId, title, disabled }: { trackId: string; title: string; disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [replaced, setReplaced] = useState(false);
  const { busy, error, setError, run } = useAdminAction();

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = ''; // let the same file be picked again after a cancel
    if (!picked) return;
    const problem = audioFileError(picked);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setReplaced(false);
    setFile(picked);
  }

  async function confirm() {
    if (!file) return;
    const ok = await run(async () => {
      setProgress(0);
      const up = await uploadOne(file, { createUploadUrls, putFile }, setProgress);
      if (up.error !== null) return { error: up.error };
      return replaceTrackAudio(trackId, up.key);
    });
    setProgress(null);
    if (ok) {
      setFile(null);
      setReplaced(true);
    }
  }

  return (
    <>
      <FileInput
        id={`${trackId}-replace`}
        buttonLabel="Replace MP3"
        aria-label={`Replace MP3 for ${title}`}
        variant="secondary"
        size="sm"
        accept=".mp3,audio/mpeg"
        disabled={disabled || busy}
        onChange={pick}
      />
      {replaced ? <Status role="status">MP3 replaced.</Status> : null}
      {error && !file ? <Status $tone="error" role="alert">{error}</Status> : null}
      <ConfirmModal
        open={file !== null}
        title={`Replace the MP3 for "${title}"?`}
        body={`${file?.name ?? ''} replaces the current file. Downloads already made keep the old file.`}
        confirmLabel="Replace"
        busy={busy}
        error={error}
        progress={progress}
        onConfirm={confirm}
        onClose={() => {
          setFile(null);
          setError(null);
        }}
      />
    </>
  );
}
