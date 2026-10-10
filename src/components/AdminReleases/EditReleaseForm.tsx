'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { Heading } from '@/components/Heading';
import { Input } from '@/components/Input';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { ArtistCombobox } from '@/components/Upload/ArtistCombobox';
import { Footer, Section } from '@/components/Upload/upload.styles';
import type { AdminRelease } from '@/lib/admin/releases';
import { saveRelease } from '@/lib/admin/release-actions';
import { AddTrackForm } from './AddTrackForm';
import { ArchiveControl } from './ArchiveControl';
import { buildEditPayload, draftFrom, draftKey, editReducer, hasDraftErrors, isDraftDirty, pendingInDraft, validateDraft } from './edit-reducer';
import { RemovedTracks } from './RemovedTracks';
import { HeaderRow, Status } from './releases.styles';
import { TrackEditor } from './TrackEditor';

const ID3_HINT = "Downloads keep the MP3's own tags — replace the MP3 with a re-tagged file to update them.";

// Hybrid save (spec D3): titles/artists/order are a draft saved by one
// atomic call; file and track-lifecycle actions apply immediately and are
// locked while the draft is dirty, so the draft never goes stale under us.
export function EditReleaseForm({ release }: { release: AdminRelease }) {
  const [state, dispatch] = useReducer(editReducer, release, draftFrom);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Server data changes after every successful action (revalidatePath).
  // Only when the data actually changed: a new object with the same content
  // must not wipe an unsaved draft.
  const appliedKey = useRef(draftKey(release));
  useEffect(() => {
    const key = draftKey(release);
    if (key === appliedKey.current) return;
    appliedKey.current = key;
    dispatch({ type: 'reset', release });
    setFormError(null);
  }, [release]);

  const dirty = isDraftDirty(state, release);
  const locked = dirty || saving;
  const errors = state.showErrors ? validateDraft(state) : { tracks: {} as Record<string, { title?: string; artists?: string }> };
  const pending = pendingInDraft(state);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    if (hasDraftErrors(validateDraft(state))) {
      dispatch({ type: 'showErrors' });
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await saveRelease(release.id, buildEditPayload(state));
      if (res.error) setFormError(res.error);
    } catch {
      setFormError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <HeaderRow>
      <Heading $level={2}>{release.title}</Heading>
      <Tag>{release.kind}</Tag>
      <ArchiveControl releaseId={release.id} title={release.title} archived={release.archived} disabled={locked} />
    </HeaderRow>
  );

  if (release.archived) {
    return (
      <>
        {header}
        <Alert $tone="warning">Archived — restore to edit.</Alert>
        <Section aria-label="Tracks">
          {release.tracks.map((t) => (
            <Text key={t.id} $variant="muted">{t.title}</Text>
          ))}
        </Section>
      </>
    );
  }

  return (
    <>
      {header}
      {formError ? <Alert $tone="error" role="alert">{formError}</Alert> : null}

      {state.album ? (
        <Section aria-label="Album details">
          <FormField label="Album title" htmlFor="album-title" error={errors.albumTitle}>
            <Input id="album-title" value={state.album.title} disabled={saving} $invalid={Boolean(errors.albumTitle)} onChange={(e) => dispatch({ type: 'setAlbumTitle', title: e.target.value })} />
          </FormField>
          <ArtistCombobox
            id="album-artists"
            label="Album artists (optional)"
            chips={state.album.artists}
            pending={pending}
            disabled={saving}
            onAdd={(chip) => dispatch({ type: 'addAlbumArtist', chip })}
            onRemove={(key) => dispatch({ type: 'removeAlbumArtist', key })}
            onMove={(key, dir) => dispatch({ type: 'moveAlbumArtist', key, dir })}
          />
        </Section>
      ) : null}

      <Section aria-label="Tracks">
        <Text $variant="muted">{ID3_HINT}</Text>
        {dirty ? <Status role="status">Save or discard your changes first.</Status> : null}
        {state.tracks.map((track, i) => (
          <TrackEditor
            key={track.id}
            track={track}
            index={i}
            total={state.tracks.length}
            kind={release.kind}
            errors={errors.tracks[track.id]}
            pending={pending}
            dispatch={dispatch}
            disabled={saving}
            locked={locked}
          />
        ))}
      </Section>

      {release.kind === 'album' ? (
        <>
          <RemovedTracks tracks={release.tracks.filter((t) => t.archived)} disabled={locked} />
          <AddTrackForm releaseId={release.id} disabled={locked} />
        </>
      ) : null}

      <Footer>
        <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => {
          dispatch({ type: 'reset', release });
          setFormError(null);
        }}>Discard</Button>
        <Button type="button" loading={saving} disabled={!dirty} onClick={save}>Save changes</Button>
      </Footer>
    </>
  );
}
