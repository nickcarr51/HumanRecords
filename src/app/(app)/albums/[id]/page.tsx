import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAlbum } from '@/lib/supabase/albums';
import { AlbumTracks } from '@/components';
import { Page, Back, Head, Art, ArtPlaceholder, Title, Artists } from './album-page.styles';

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const album = await getAlbum(supabase, id);
  if (!album) notFound();

  const artist = album.artistNames.length ? album.artistNames.join(', ') : 'Unknown Artist';

  return (
    <Page>
      <Back as={Link} href="/feed">
        ‹ timeline
      </Back>
      <Head>
        {album.albumArtUrl ? (
          <Art src={album.albumArtUrl} alt="" />
        ) : (
          <ArtPlaceholder aria-hidden />
        )}
        <div>
          <Title>{album.title}</Title>
          <Artists>{artist}</Artists>
        </div>
      </Head>
      <AlbumTracks tracks={album.tracks} />
    </Page>
  );
}
