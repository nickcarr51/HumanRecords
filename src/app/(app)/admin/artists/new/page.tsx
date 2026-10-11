import type { Metadata } from 'next';
import { Heading } from '@/components/Heading';
import { ArtistForm } from '@/components/AdminArtists';
import { requireLabelMember } from '@/lib/auth/role';
import { Back, Page } from '../../admin.styles';

export const metadata: Metadata = { title: 'Admin · New artist' };

export default async function NewArtistPage() {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  return (
    <Page>
      <Back href="/admin/artists">‹ artists</Back>
      <Heading $level={2}>New artist</Heading>
      <ArtistForm />
    </Page>
  );
}
