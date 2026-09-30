'use client';

import { useEffect, useReducer, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { Heading } from '@/components/Heading';
import { Input } from '@/components/Input';
import { createUploadUrls, publishRelease } from '@/lib/admin/actions';
import type { ReleaseKind } from '@/lib/admin/types';
import { ArtistCombobox } from './ArtistCombobox';
import { KindToggle } from './KindToggle';
import { TrackWidget } from './TrackWidget';
import { putFile, runPublish } from './upload-engine';
import {
  createInitialState,
  isDirty,
  needsKindConfirm,
  pendingNewArtists,
  uploadReducer,
  validate,
} from './upload-reducer';
import { Footer, Page, Section } from './upload.styles';

const newId = () => crypto.randomUUID();

export function UploadForm() {
  const router = useRouter();
  const [state, dispatch] = useReducer(uploadReducer, undefined, () => createInitialState(newId()));
  // Guards a double-click landing before React re-renders with publishing=true.
  const inFlight = useRef(false);

  const dirty = isDirty(state);
  const errors = state.showErrors ? validate(state) : { tracks: {} };
  const pending = pendingNewArtists(state);
  const busy = state.publishing;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function setKind(kind: ReleaseKind) {
    if (needsKindConfirm(state, kind) && !window.confirm('Switch to a single? Tracks after Track 1 and the album details will be removed.')) return;
    dispatch({ type: 'setKind', kind });
  }

  function clearAll() {
    if (window.confirm('Clear everything on this form?')) dispatch({ type: 'clear', clientId: newId() });
  }

  function cancel() {
    if (dirty && !window.confirm('Leave without publishing? Your changes will be lost.')) return;
    router.push('/admin');
  }

  // runPublish handles rejected server calls itself (and rethrows redirects);
  // the finally only resets the double-click guard.
  async function publish() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await runPublish(state, { createUploadUrls, putFile, publishRelease, dispatch });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <Page>
      <Heading $level={2}>Upload a release</Heading>
      <KindToggle value={state.kind} onChange={setKind} disabled={busy} />

      {state.formError ? <Alert $tone="error" role="alert">{state.formError}</Alert> : null}
      {errors.form ? <Alert $tone="error" role="alert">{errors.form}</Alert> : null}

      {state.kind === 'album' ? (
        <Section aria-label="Album details">
          <FormField label="Album title" htmlFor="album-title" error={errors.albumTitle}>
            <Input
              id="album-title"
              value={state.album.title}
              disabled={busy}
              $invalid={Boolean(errors.albumTitle)}
              onChange={(e) => dispatch({ type: 'setAlbumTitle', title: e.target.value })}
            />
          </FormField>
          <ArtistCombobox
            id="album-artists"
            label="Album artists (optional)"
            chips={state.album.artists}
            pending={pending}
            onAdd={(chip) => dispatch({ type: 'addAlbumArtist', chip })}
            onRemove={(key) => dispatch({ type: 'removeAlbumArtist', key })}
            onMove={(key, dir) => dispatch({ type: 'moveAlbumArtist', key, dir })}
          />
        </Section>
      ) : null}

      <Section aria-label="Tracks">
        {state.tracks.map((track, i) => (
          <TrackWidget
            key={track.clientId}
            track={track}
            index={i}
            total={state.tracks.length}
            kind={state.kind}
            errors={errors.tracks[track.clientId]}
            pending={pending}
            dispatch={dispatch}
            disabled={busy}
          />
        ))}
        {state.kind === 'album' ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => dispatch({ type: 'addTrack', clientId: newId() })}>
            + Add track
          </Button>
        ) : null}
      </Section>

      <Footer>
        <Button type="button" variant="ghost" disabled={busy} onClick={clearAll}>Clear all</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={cancel}>Cancel</Button>
        <Button type="button" loading={busy} onClick={publish}>Publish</Button>
      </Footer>
    </Page>
  );
}
