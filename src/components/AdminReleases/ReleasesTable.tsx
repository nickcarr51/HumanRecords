'use client';

import NextLink from 'next/link';
import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import { Link } from '@/components/Link';
import { Mono } from '@/components/Mono';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { IconButton } from '@/components/Upload/upload.styles';
import type { AdminReleaseRow } from '@/lib/admin/releases';
import { moveRelease, setPinned } from '@/lib/admin/release-actions';
import { albumArtistLabel } from '@/lib/supabase/artist-names';
import { ArchiveControl } from './ArchiveControl';
import { Actions, Cell, Group, Row, Status, Table, TextCell } from './releases.styles';
import { useAdminAction } from './use-admin-action';

// UTC so server and client render the same date (no hydration mismatch).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function artistLabel(r: AdminReleaseRow): string {
  return r.kind === 'album' ? albumArtistLabel(r.artistNames) : r.artistNames.join(', ');
}

function ReleaseRow({ release, isFirst, isLast }: { release: AdminReleaseRow; isFirst: boolean; isLast: boolean }) {
  const { busy, error, run } = useAdminAction();
  const { id, title, archived, pinned } = release;
  return (
    <Row>
      <TextCell $muted={archived}>
        <Cell>
          <Link as={NextLink} href={`/admin/releases/${id}`}>{title}</Link>
          <Status>{artistLabel(release)}</Status>
        </Cell>
      </TextCell>
      <TextCell $muted={archived}><Tag>{release.kind}</Tag></TextCell>
      <TextCell $muted={archived}><Mono>{formatDate(release.createdAt)}</Mono></TextCell>
      <td>
        <Actions>
          {archived ? null : (
            <>
              <IconButton type="button" aria-label={`Move ${title} up`} disabled={busy || isFirst} onClick={() => run(() => moveRelease(id, 'up'))}>↑</IconButton>
              <IconButton type="button" aria-label={`Move ${title} down`} disabled={busy || isLast} onClick={() => run(() => moveRelease(id, 'down'))}>↓</IconButton>
              <Button type="button" size="sm" variant="secondary" aria-label={`${pinned ? 'Unpin' : 'Pin'} ${title}`} disabled={busy} onClick={() => run(() => setPinned(id, !pinned))}>
                {pinned ? 'Unpin' : 'Pin'}
              </Button>
            </>
          )}
          <ArchiveControl releaseId={id} title={title} archived={archived} />
          {error ? <Status $tone="error" role="alert">{error}</Status> : null}
        </Actions>
      </td>
    </Row>
  );
}

function ReleaseGroup({ name, rows, empty }: { name: string; rows: AdminReleaseRow[]; empty: string }) {
  return (
    <Group aria-label={name}>
      <Heading $level={3}>{name}</Heading>
      {rows.length === 0 ? (
        <Text $variant="muted">{empty}</Text>
      ) : (
        <Table>
          <thead>
            <tr>
              <th scope="col">Release</th>
              <th scope="col">Kind</th>
              <th scope="col">Uploaded</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <ReleaseRow key={r.id} release={r} isFirst={i === 0} isLast={i === rows.length - 1} />
            ))}
          </tbody>
        </Table>
      )}
    </Group>
  );
}

// `releases` arrives in feed order; filtering keeps that order inside each
// group, and edges are computed from live rows only (move_release skips archived).
export function ReleasesTable({ releases, showArchived }: { releases: AdminReleaseRow[]; showArchived: boolean }) {
  const pinned = releases.filter((r) => !r.archived && r.pinned);
  const feed = releases.filter((r) => !r.archived && !r.pinned);
  const archived = releases.filter((r) => r.archived);
  return (
    <>
      <ReleaseGroup name="Pinned" rows={pinned} empty="Nothing pinned." />
      <ReleaseGroup name="Feed" rows={feed} empty="No releases yet." />
      <Link as={NextLink} href={showArchived ? '/admin/releases' : '/admin/releases?archived=1'}>
        {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
      </Link>
      {showArchived ? <ReleaseGroup name="Archived" rows={archived} empty="Nothing archived." /> : null}
    </>
  );
}
