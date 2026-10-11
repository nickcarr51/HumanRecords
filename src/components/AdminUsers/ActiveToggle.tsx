'use client';

import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import { Modal } from '@/components/Modal';
import { Row } from '@/components/Row';
import { Stack } from '@/components/Stack';
import { Text } from '@/components/Text';
import { Danger } from '@/components/AdminArtists/admin-artists.styles';
import { setUserActive } from '@/lib/admin/users-actions';
import type { AdminUserRow } from '@/lib/admin/users-types';

// Deactivate = Supabase auth ban (reversible, keeps download history).
// The page hides this on the caller's own account; the action blocks it too.
export function ActiveToggle({ user }: { user: AdminUserRow }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(active: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await setUserActive(user.id, active);
      if (res.error) setError(res.error);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <Danger aria-label="Danger">
      <Heading $level={3}>Danger</Heading>
      <Text $variant="muted">
        {user.deactivated
          ? 'This account is deactivated. They can’t sign in.'
          : 'Deactivated users can’t sign in. Their download history is kept, and you can reactivate them.'}
      </Text>
      {error ? (
        <Alert $tone="error" role="alert">
          {error}
        </Alert>
      ) : null}
      <div>
        {user.deactivated ? (
          <Button type="button" variant="secondary" loading={pending} onClick={() => apply(true)}>
            Reactivate
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            Deactivate
          </Button>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} label="Deactivate account">
        <Stack $gap="md">
          <Text>Deactivate {user.email}? They won’t be able to sign in until you reactivate them.</Text>
          <Row $gap="sm">
            <Button type="button" loading={pending} onClick={() => apply(false)}>
              Deactivate account
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
