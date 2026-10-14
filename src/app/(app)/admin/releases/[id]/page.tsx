import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Alert } from '@/components/Alert';
import { AnalyzeWaveforms, EditReleaseForm } from '@/components/AdminReleases';
import { getAdminRelease, type AdminRelease } from '@/lib/admin/releases';
import { requireLabelMember } from '@/lib/auth/role';
import { createClient } from '@/lib/supabase/server';
import { Back, Page } from '../../admin.styles';

export const metadata: Metadata = { title: 'Admin · Edit release' };

export default async function EditReleasePage({ params }: { params: Promise<{ id: string }> }) {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  const { id } = await params;

  let release: AdminRelease | null = null;
  let loadFailed = false;
  try {
    release = await getAdminRelease(await createClient(), id);
  } catch (err) {
    console.error('Failed to load release', err);
    loadFailed = true;
  }
  if (loadFailed) {
    return (
      <Page>
        <Back href="/admin/releases">‹ releases</Back>
        <Alert $tone="error" role="alert">Couldn&apos;t load this release.</Alert>
      </Page>
    );
  }
  // Outside the try so notFound()'s throw isn't swallowed.
  if (!release) notFound();

  return (
    <Page>
      <Back href={release.archived ? '/admin/releases?archived=1' : '/admin/releases'}>‹ releases</Back>
      <EditReleaseForm release={release} />
      <AnalyzeWaveforms tracks={release.tracks.filter((t) => !t.archived).map(({ id, title }) => ({ id, title }))} />
    </Page>
  );
}
