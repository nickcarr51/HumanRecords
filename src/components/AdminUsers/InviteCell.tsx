'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';
import { Link } from '@/components/Link';
import { issueInvite } from '@/lib/admin/users-actions';
import type { AdminUserRow } from '@/lib/admin/users-types';
import { mailtoHref } from './mailto';
import { Actions, Cell, Status, UrlText } from './users.styles';

const REGENERATE_CONFIRM =
  'The current link will stop working, including any NFC card already written with it.';

// UTC so server and client render the same date (no hydration mismatch).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function InviteCell({ user }: { user: AdminUserRow }) {
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue(confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    setError(null);
    try {
      const res = await issueInvite(user.id);
      if (res.error) setError(res.error);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  }

  const { invite } = user;
  return (
    <Cell>
      {invite.status === 'unused' ? (
        <>
          <Status>Not used yet</Status>
          <UrlText title={invite.url}>{invite.url}</UrlText>
          <Actions>
            <Button type="button" variant="secondary" size="sm" onClick={() => copy(invite.url)}>
              {copied ? 'Copied ✓' : 'Copy'}
            </Button>
            <Link href={mailtoHref(user.email, invite.url)}>Email</Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={pending}
              onClick={() => issue(REGENERATE_CONFIRM)}
            >
              Regenerate
            </Button>
          </Actions>
        </>
      ) : invite.status === 'used' ? (
        <>
          <Status>Used {formatDate(invite.usedAt)}</Status>
          <Actions>
            <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => issue()}>
              New link
            </Button>
          </Actions>
        </>
      ) : (
        <>
          <Status>No link</Status>
          <Actions>
            <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => issue()}>
              Create link
            </Button>
          </Actions>
        </>
      )}
      {error ? (
        <Status $tone="error" role="alert">
          {error}
        </Status>
      ) : null}
    </Cell>
  );
}
