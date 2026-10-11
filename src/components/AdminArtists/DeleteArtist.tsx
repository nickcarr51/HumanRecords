'use client';

import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import { Modal } from '@/components/Modal';
import { Row } from '@/components/Row';
import { Stack } from '@/components/Stack';
import { Text } from '@/components/Text';
import { deleteArtist } from '@/lib/admin/artists-actions';
import { creditMessage } from '@/lib/admin/artists-types';
import { Danger } from './admin-artists.styles';
import { isRedirectError } from './redirect';

export interface DeleteArtistProps {
  artistId: string;
  name: string;
  trackCount: number;
  albumCount: number;
}

// Credited artists can't be deleted (FK restrict); the action re-checks and
// maps the DB error to the same message if counts changed since render.
export function DeleteArtist({ artistId, name, trackCount, albumCount }: DeleteArtistProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const credited = trackCount + albumCount > 0;

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const res = await deleteArtist(artistId);
      if (res.error) setError(res.error);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      setError('Something went wrong. Try again.');
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <Danger aria-label="Danger">
      <Heading $level={3}>Danger</Heading>
      {credited ? <Text $variant="muted">{creditMessage(trackCount, albumCount)}</Text> : null}
      {error ? (
        <Alert $tone="error" role="alert">
          {error}
        </Alert>
      ) : null}
      <div>
        <Button type="button" variant="secondary" disabled={credited} onClick={() => setOpen(true)}>
          Delete artist
        </Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} label="Delete artist">
        <Stack $gap="md">
          <Text>Delete {name}? This can&apos;t be undone.</Text>
          <Row $gap="sm">
            <Button type="button" loading={pending} onClick={confirm}>
              Delete
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </Row>
        </Stack>
      </Modal>
    </Danger>
  );
}
