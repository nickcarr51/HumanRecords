import { notFound } from 'next/navigation';
import { EditReleaseForm } from '@/components/AdminReleases';
import { getAdminRelease } from '@/lib/admin/releases';
import { requireLabelMember } from '@/lib/auth/role';
import { createClient } from '@/lib/supabase/server';
import { Back, Page } from '../../admin.styles';

export default async function EditReleasePage({ params }: { params: Promise<{ id: string }> }) {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  const { id } = await params;
  const release = await getAdminRelease(await createClient(), id);
  if (!release) notFound();

  return (
    <Page>
      <Back href="/admin/releases">‹ releases</Back>
      <EditReleaseForm release={release} />
    </Page>
  );
}
