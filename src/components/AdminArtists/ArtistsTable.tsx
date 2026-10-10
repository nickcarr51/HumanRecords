'use client';

import NextLink from 'next/link';
import { Text } from '@/components/Text';
import { Cell, Table } from '@/components/AdminUsers/users.styles';
import { userLabel, type AdminArtistRow } from '@/lib/admin/artists-types';

// UTC so server and client render the same date (no hydration mismatch).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export interface ArtistsTableProps {
  artists: AdminArtistRow[];
  query: string;
}

export function ArtistsTable({ artists, query }: ArtistsTableProps) {
  if (artists.length === 0) {
    return <Text $variant="muted">{query ? `No artists match "${query}".` : 'No artists yet.'}</Text>;
  }
  return (
    <Table>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Linked user</th>
          <th scope="col">Tracks</th>
          <th scope="col">Albums</th>
          <th scope="col">Created</th>
        </tr>
      </thead>
      <tbody>
        {artists.map((a) => (
          <tr key={a.id}>
            <td>
              <Cell>
                <strong>
                  <NextLink href={`/admin/artists/${a.id}`}>{a.name}</NextLink>
                </strong>
              </Cell>
            </td>
            <td>{a.linkedUser ? userLabel(a.linkedUser) : '—'}</td>
            <td aria-label="Tracks">{a.trackCount}</td>
            <td aria-label="Albums">{a.albumCount}</td>
            <td>{formatDate(a.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
