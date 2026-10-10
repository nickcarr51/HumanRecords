// src/components/AdminReleases/RemoveTrack.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';
import { removeTrack } from '@/lib/admin/release-actions';
import { ConfirmModal } from './ConfirmModal';
import { useAdminAction } from './use-admin-action';

export function RemoveTrack({ trackId, title, isLastLive, disabled }: { trackId: string; title: string; isLastLive: boolean; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { busy, error, setError, run } = useAdminAction();
  const body = isLastLive
    ? "This is the album's last track, so the album will be archived too. You can restore it later."
    : "It leaves the album and can't be played or downloaded. You can restore it from Removed tracks.";
  return (
    <>
      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>Remove</Button>
      <ConfirmModal
        open={open}
        title={`Remove "${title}"?`}
        body={body}
        confirmLabel="Remove track"
        busy={busy}
        error={error}
        onConfirm={async () => {
          if (await run(() => removeTrack(trackId))) setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
