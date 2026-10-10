'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';
import { archiveRelease, restoreRelease } from '@/lib/admin/release-actions';
import { ConfirmModal } from './ConfirmModal';
import { Status } from './releases.styles';
import { useAdminAction } from './use-admin-action';

// Archive (with confirmation) or Restore (no confirmation: it's the safe direction).
export function ArchiveControl({ releaseId, title, archived }: { releaseId: string; title: string; archived: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const { busy, error, setError, run } = useAdminAction();

  if (archived) {
    return (
      <>
        <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => run(() => restoreRelease(releaseId))}>
          Restore
        </Button>
        {error ? <Status $tone="error" role="alert">{error}</Status> : null}
      </>
    );
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>Archive</Button>
      <ConfirmModal
        open={confirming}
        title={`Archive "${title}"?`}
        body="It disappears from the feed and its tracks can't be played or downloaded. You can restore it later."
        confirmLabel="Archive release"
        busy={busy}
        error={error}
        onConfirm={async () => {
          if (await run(() => archiveRelease(releaseId))) setConfirming(false);
        }}
        onClose={() => {
          setConfirming(false);
          setError(null);
        }}
      />
    </>
  );
}
