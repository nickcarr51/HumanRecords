import { Alert } from '@/components/Alert';
import { Heading } from '@/components/Heading';
import { ReleasesTable } from '@/components/AdminReleases';
import { getAdminReleases, type AdminReleaseRow } from '@/lib/admin/releases';
import { requireLabelMember } from '@/lib/auth/role';
import { createClient } from '@/lib/supabase/server';
import { Back, Page } from '../admin.styles';

export default async function AdminReleasesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  const { archived } = await searchParams;

  let releases: AdminReleaseRow[] = [];
  let loadError: string | null = null;
  try {
    releases = await getAdminReleases(await createClient());
  } catch (err) {
    console.error('Failed to load releases', err);
    loadError = "Couldn't load releases.";
  }

  return (
    <Page>
      <Back href="/admin">‹ admin</Back>
      <Heading $level={2}>Releases</Heading>
      {loadError ? (
        <Alert $tone="error" role="alert">{loadError}</Alert>
      ) : (
        <ReleasesTable releases={releases} showArchived={archived === '1'} />
      )}
    </Page>
  );
}
