// src/components/AdminReleases/RemovedTracks.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import type { AdminTrack } from '@/lib/admin/releases';
import { restoreTrack } from '@/lib/admin/release-actions';
import { Actions, Group, Status } from './releases.styles';
import { useAdminAction } from './use-admin-action';

function RemovedRow({ track, disabled, onBusy }: { track: AdminTrack; disabled: boolean; onBusy: (id: string, busy: boolean) => void }) {
  const { busy, error, run } = useAdminAction();
  const id = track.id;
  useEffect(() => {
    onBusy(id, busy);
    return () => onBusy(id, false);
  }, [id, busy, onBusy]);
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

export function RemovedTracks({ tracks, disabled, onBusyChange }: { tracks: AdminTrack[]; disabled: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const onBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((prev) => {
      if (prev.has(id) === busy) return prev;
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const anyBusy = busyIds.size > 0;
  useEffect(() => {
    onBusyChange?.(anyBusy);
  }, [anyBusy, onBusyChange]);
  if (tracks.length === 0) return null;
  return (
    <Group aria-label="Removed tracks">
      <Heading $level={3}>Removed tracks</Heading>
      {tracks.map((t) => (
        <RemovedRow key={t.id} track={t} disabled={disabled} onBusy={onBusy} />
      ))}
    </Group>
  );
}
