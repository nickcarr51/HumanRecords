// src/components/AdminReleases/AddTrackForm.tsx
'use client';

import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { FileInput } from '@/components/FileInput';
import { FormField } from '@/components/FormField';
import { Heading } from '@/components/Heading';
import { Input } from '@/components/Input';
import { ArtistCombobox } from '@/components/Upload/ArtistCombobox';
import { putFile } from '@/components/Upload/upload-engine';
import { TrackCard } from '@/components/Upload/upload.styles';
import { addChip, moveChip, titleFromFilename, toRef, type ArtistChip } from '@/components/Upload/upload-reducer';
import { createUploadUrls } from '@/lib/admin/actions';
import { addAlbumTrack } from '@/lib/admin/release-actions';
import { audioFileError } from '@/lib/admin/rules';
import { Status } from './releases.styles';
import { uploadOne } from './upload-one';
import { useAdminAction } from './use-admin-action';

// Appends a track to a published album: upload → addAlbumTrack (one transaction).
export function AddTrackForm({ releaseId, disabled }: { releaseId: string; disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artists, setArtists] = useState<ArtistChip[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const { busy, error, run } = useAdminAction();
  const off = disabled || busy;

  const fileError = file ? audioFileError(file) ?? undefined : 'Choose an MP3.';
  const titleError = title.trim() ? undefined : 'Title is required.';
  const artistsError = artists.length ? undefined : 'Add at least one artist.';

  function pick(picked: File | null) {
    setFile(picked);
    if (picked && !title.trim()) setTitle(titleFromFilename(picked.name));
  }

  async function submit() {
    if (!file || fileError || titleError || artistsError) {
      setShowErrors(true);
      return;
    }
    const ok = await run(async () => {
      setProgress(0);
      const up = await uploadOne(file, { createUploadUrls, putFile }, setProgress);
      if (up.error !== null) return { error: up.error };
      return addAlbumTrack(releaseId, { title: title.trim(), audioKey: up.key, artists: artists.map(toRef) });
    });
    setProgress(null);
    if (ok) {
      setFile(null);
      setTitle('');
      setArtists([]);
      setShowErrors(false);
    }
  }

  return (
    <TrackCard aria-label="Add a track">
      <Heading $level={3}>Add a track</Heading>
      <FormField label="MP3 file" htmlFor="add-track-file" error={showErrors ? fileError : undefined} hint={file ? file.name : 'MP3, up to 50 MB'}>
        <FileInput id="add-track-file" buttonLabel={file ? 'Change MP3' : 'Choose MP3'} accept=".mp3,audio/mpeg" disabled={off} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </FormField>
      <FormField label="Track title" htmlFor="add-track-title" error={showErrors ? titleError : undefined}>
        <Input id="add-track-title" value={title} disabled={off} onChange={(e) => setTitle(e.target.value)} />
      </FormField>
      <ArtistCombobox
        id="add-track-artists"
        label="Artists"
        chips={artists}
        pending={artists.filter((c) => c.id === null)}
        error={showErrors ? artistsError : undefined}
        disabled={off}
        onAdd={(chip) => setArtists((list) => addChip(list, chip))}
        onRemove={(key) => setArtists((list) => list.filter((c) => c.key !== key))}
        onMove={(key, dir) => setArtists((list) => moveChip(list, key, dir))}
      />
      {progress != null ? <Status role="status">Uploading… {Math.round(progress * 100)}%</Status> : null}
      {error ? <Alert $tone="error" role="alert">{error}</Alert> : null}
      <Button type="button" loading={busy} disabled={disabled} onClick={submit}>Add track</Button>
    </TrackCard>
  );
}
