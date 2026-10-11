'use client';

import { FormField } from '@/components/FormField';
import { Input } from '@/components/Input';
import { ArtistCombobox } from '@/components/Upload/ArtistCombobox';
import { IconButton, TrackCard, TrackControls, TrackHeader } from '@/components/Upload/upload.styles';
import type { ArtistChip } from '@/components/Upload/upload-reducer';
import type { ReleaseKind } from '@/lib/admin/types';
import type { DraftTrack, EditAction } from './edit-reducer';
import { RemoveTrack } from './RemoveTrack';
import { ReplaceAudio } from './ReplaceAudio';
import { Actions } from './releases.styles';

export interface TrackEditorProps {
  track: DraftTrack;
  index: number;
  total: number;
  kind: ReleaseKind;
  errors?: { title?: string; artists?: string };
  pending: ArtistChip[];
  dispatch: (a: EditAction) => void;
  disabled: boolean; // draft fields (true while saving or while an instant action is in flight)
  onRemoveBusyChange?: (busy: boolean) => void;
  locked: boolean; // instant actions (true while the draft is dirty or saving)
}

export function TrackEditor({ track, index, total, kind, errors, pending, dispatch, disabled, locked, onRemoveBusyChange }: TrackEditorProps) {
  const id = track.id;
  return (
    <TrackCard>
      {kind === 'album' ? (
        <TrackHeader>
          <span>Track {index + 1}</span>
          <TrackControls>
            <IconButton type="button" aria-label={`Move track ${index + 1} up`} disabled={disabled || index === 0} onClick={() => dispatch({ type: 'moveTrack', id, dir: -1 })}>↑</IconButton>
            <IconButton type="button" aria-label={`Move track ${index + 1} down`} disabled={disabled || index === total - 1} onClick={() => dispatch({ type: 'moveTrack', id, dir: 1 })}>↓</IconButton>
          </TrackControls>
        </TrackHeader>
      ) : null}
      <FormField label="Track title" htmlFor={`${id}-title`} error={errors?.title}>
        <Input id={`${id}-title`} value={track.title} disabled={disabled} $invalid={Boolean(errors?.title)} onChange={(e) => dispatch({ type: 'setTrackTitle', id, title: e.target.value })} />
      </FormField>
      <ArtistCombobox
        id={`${id}-artists`}
        label="Artists"
        chips={track.artists}
        pending={pending}
        error={errors?.artists}
        disabled={disabled}
        onAdd={(chip) => dispatch({ type: 'addTrackArtist', id, chip })}
        onRemove={(key) => dispatch({ type: 'removeTrackArtist', id, key })}
        onMove={(key, dir) => dispatch({ type: 'moveTrackArtist', id, key, dir })}
      />
      <Actions>
        <ReplaceAudio trackId={id} title={track.title} disabled={locked} />
        {kind === 'album' ? <RemoveTrack trackId={id} title={track.title} isLastLive={total === 1} disabled={locked} onBusyChange={onRemoveBusyChange} /> : null}
      </Actions>
    </TrackCard>
  );
}
