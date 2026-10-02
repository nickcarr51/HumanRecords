'use client';

import { Input } from '@/components/Input';
import { FormField } from '@/components/FormField';
import type { ReleaseKind } from '@/lib/admin/types';
import { ArtistCombobox } from './ArtistCombobox';
import type { ArtistChip, TrackDraft, TrackErrors, UploadAction } from './upload-reducer';
import { IconButton, Progress, TrackCard, TrackControls, TrackHeader, UploadError } from './upload.styles';

export function TrackWidget({
  track,
  index,
  total,
  kind,
  errors,
  pending,
  dispatch,
  disabled,
}: {
  track: TrackDraft;
  index: number;
  total: number;
  kind: ReleaseKind;
  errors?: TrackErrors;
  pending: ArtistChip[];
  dispatch: (a: UploadAction) => void;
  disabled: boolean;
}) {
  const id = track.clientId;
  const { upload } = track;
  const fileError = track.fileError ?? errors?.file;

  return (
    <TrackCard>
      {upload.status !== 'idle' ? (
        <Progress
          role="progressbar"
          aria-label={`Track ${index + 1} upload`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(upload.progress * 100)}
          $value={upload.progress}
          $error={upload.status === 'error'}
        />
      ) : null}

      {kind === 'album' ? (
        <TrackHeader>
          <span>Track {index + 1}</span>
          <TrackControls>
            <IconButton type="button" aria-label={`Move track ${index + 1} up`} disabled={disabled || index === 0} onClick={() => dispatch({ type: 'moveTrack', clientId: id, dir: -1 })}>↑</IconButton>
            <IconButton type="button" aria-label={`Move track ${index + 1} down`} disabled={disabled || index === total - 1} onClick={() => dispatch({ type: 'moveTrack', clientId: id, dir: 1 })}>↓</IconButton>
            <IconButton type="button" aria-label={`Remove track ${index + 1}`} disabled={disabled || total <= 1} onClick={() => dispatch({ type: 'removeTrack', clientId: id })}>✕</IconButton>
          </TrackControls>
        </TrackHeader>
      ) : null}

      <FormField label="MP3 file" htmlFor={`${id}-file`} error={fileError} hint={track.file ? `${track.file.name} · ${(track.file.size / 1024 / 1024).toFixed(1)} MB` : 'MP3, up to 50 MB'}>
        <Input
          id={`${id}-file`}
          type="file"
          accept=".mp3,audio/mpeg"
          disabled={disabled}
          $invalid={Boolean(fileError)}
          onChange={(e) => dispatch({ type: 'setTrackFile', clientId: id, file: e.target.files?.[0] ?? null })}
        />
      </FormField>
      {upload.error ? <UploadError role="alert">{upload.error}</UploadError> : null}

      <FormField label="Track title" htmlFor={`${id}-title`} error={errors?.title}>
        <Input
          id={`${id}-title`}
          value={track.title}
          disabled={disabled}
          $invalid={Boolean(errors?.title)}
          onChange={(e) => dispatch({ type: 'setTrackTitle', clientId: id, title: e.target.value })}
        />
      </FormField>

      <ArtistCombobox
        id={`${id}-artists`}
        label="Artists"
        chips={track.artists}
        pending={pending}
        error={errors?.artists}
        disabled={disabled}
        onAdd={(chip) => dispatch({ type: 'addTrackArtist', clientId: id, chip })}
        onRemove={(key) => dispatch({ type: 'removeTrackArtist', clientId: id, key })}
        onMove={(key, dir) => dispatch({ type: 'moveTrackArtist', clientId: id, key, dir })}
      />
    </TrackCard>
  );
}
