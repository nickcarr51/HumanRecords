import { Alert } from '@/components/Alert';
import { Heading } from '@/components/Heading';
import { NewUserForm, UsersTable } from '@/components/AdminUsers';
import { listAdminUsers } from '@/lib/admin/users';
import type { AdminUserRow } from '@/lib/admin/users-types';
import { requireLabelMember } from '@/lib/auth/role';
import { getSessionUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Back, Page } from '../admin.styles';

export default async function AdminUsersPage() {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();

  const claims = await getSessionUser();
  const selfId = typeof claims?.sub === 'string' ? claims.sub : '';

  let users: AdminUserRow[] = [];
  let loadError: string | null = null;
  try {
    users = await listAdminUsers(await createClient(), process.env.SITE_URL);
  } catch (err) {
    console.error('Failed to load users', err);
    loadError =
      err instanceof Error && /SITE_URL/.test(err.message)
        ? "SITE_URL is not set — invite links can't be built."
        : "Couldn't load users.";
  }

  return (
    <Page>
      <Back href="/admin">‹ admin</Back>
      <Heading $level={2}>Users</Heading>
      <NewUserForm />
      {loadError ? (
        <Alert $tone="error" role="alert">
          {loadError}
        </Alert>
      ) : (
        <UsersTable users={users} selfId={selfId} />
      )}
    </Page>
  );
}
