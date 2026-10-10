import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Heading } from '@/components/Heading';
import { Mono } from '@/components/Mono';
import { Tag } from '@/components/Tag';
import { ActiveToggle, UserForm } from '@/components/AdminUsers';
import { getAdminUser } from '@/lib/admin/users';
import { ROLE_LABELS } from '@/lib/admin/users-types';
import { requireLabelMember } from '@/lib/auth/role';
import { getSessionUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Back, Page } from '../../admin.styles';

export const metadata: Metadata = { title: 'Admin · Edit user' };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  const { id } = await params;
  const user = await getAdminUser(await createClient(), process.env.SITE_URL, id);
  if (!user) notFound();

  const claims = await getSessionUser();
  const isSelf = claims?.sub === user.id;

  return (
    <Page>
      <Back href="/admin/users">‹ users</Back>
      <Heading $level={2}>
        {user.name ?? user.email}
        {isSelf ? ' (you)' : ''}
      </Heading>
      <Mono>{ROLE_LABELS[user.role]}</Mono>
      {user.deactivated ? <Tag $tone="warning">Deactivated</Tag> : null}
      {/* No key: remounting on revalidation would drop the inline "Saved." alert. */}
      <UserForm user={user} />
      {isSelf ? null : <ActiveToggle user={user} />}
    </Page>
  );
}
