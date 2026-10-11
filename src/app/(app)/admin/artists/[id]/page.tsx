import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Heading } from '@/components/Heading';
import { ArtistForm, DeleteArtist } from '@/components/AdminArtists';
import { getAdminArtist } from '@/lib/admin/artists';
import { requireLabelMember } from '@/lib/auth/role';
import { createClient } from '@/lib/supabase/server';
import { Back, Page } from '../../admin.styles';

export const metadata: Metadata = { title: 'Admin · Edit artist' };

export default async function EditArtistPage({ params }: { params: Promise<{ id: string }> }) {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  const { id } = await params;
  const artist = await getAdminArtist(await createClient(), id);
  if (!artist) notFound();

  return (
    <Page>
      <Back href="/admin/artists">‹ artists</Back>
      <Heading $level={2}>{artist.name}</Heading>
      <ArtistForm artist={artist} />
      <DeleteArtist artistId={artist.id} name={artist.name} trackCount={artist.trackCount} albumCount={artist.albumCount} />
    </Page>
  );
}
