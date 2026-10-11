'use client';

import NextLink from 'next/link';
import { Link } from '@/components/Link';
import { Mono } from '@/components/Mono';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import type { AdminUserRow } from '@/lib/admin/users-types';
import { InviteCell } from './InviteCell';
import { RoleSelect } from './RoleSelect';
import { Cell, Table } from './users.styles';

export interface UsersTableProps {
  users: AdminUserRow[];
  selfId: string;
}

export function UsersTable({ users, selfId }: UsersTableProps) {
  if (users.length === 0) return <Text $variant="muted">No users yet.</Text>;
  return (
    <Table>
      <thead>
        <tr>
          <th scope="col">Name / email</th>
          <th scope="col">Role</th>
          <th scope="col">Invite</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const isSelf = u.id === selfId;
          return (
            <tr key={u.id} data-deactivated={u.deactivated ? 'true' : undefined}>
              <td>
                <Cell>
                  <strong>
                    {u.name ?? '—'}
                    {isSelf ? ' (you)' : ''}
                  </strong>
                  <Mono>{u.email}</Mono>
                  {u.deactivated ? <Tag $tone="warning">Deactivated</Tag> : null}
                  <Link as={NextLink} href={`/admin/users/${u.id}`}>Edit</Link>
                </Cell>
              </td>
              <td>
                <RoleSelect
                  userId={u.id}
                  role={u.role}
                  disabled={isSelf || u.deactivated}
                  label={`Role for ${u.email}`}
                />
              </td>
              <td>
                <InviteCell user={u} disabled={u.deactivated} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
