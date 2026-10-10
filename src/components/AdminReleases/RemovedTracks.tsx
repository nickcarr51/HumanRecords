// src/components/AdminReleases/RemovedTracks.tsx
'use client';

import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import type { AdminTrack } from '@/lib/admin/releases';
import { restoreTrack } from '@/lib/admin/release-actions';
import { Actions, Group, Status } from './releases.styles';
import { useAdminAction } from './use-admin-action';

function RemovedRow({ track, disabled }: { track: AdminTrack; disabled: boolean }) {
  const { busy, error, run } = useAdminAction();
  return (
    <Actions>
      <Status>{track.title}</Status>
      <Button type="button" size="sm" variant="secondary" aria-label={`Restore ${track.title}`} loading={busy} disabled={disabled} onClick={() => run(() => restoreTrack(track.id))}>
        Restore
      </Button>
      {error ? <Status $tone="error" role="alert">{error}</Status> : null}
    </Actions>
  );
}

export function RemovedTracks({ tracks, disabled }: { tracks: AdminTrack[]; disabled: boolean }) {
  if (tracks.length === 0) return null;
  return (
    <Group aria-label="Removed tracks">
      <Heading $level={3}>Removed tracks</Heading>
      {tracks.map((t) => (
        <RemovedRow key={t.id} track={t} disabled={disabled} />
      ))}
    </Group>
  );
}
