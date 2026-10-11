import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAlbum } from '@/lib/supabase/albums';
import { getMyDownloadedTrackIds } from '@/lib/supabase/downloads';
import { AlbumTracks, DownloadsProvider } from '@/components';
import { Page, Back, Head, Art, ArtPlaceholder, Title, Artists } from './album-page.styles';
import { albumArtistLabel } from '@/lib/supabase/artist-names';

type Props = { params: Promise<{ id: string }> };

// Per-request memo: generateMetadata and the page share one getAlbum query.
const loadAlbum = cache(async (id: string) => getAlbum(await createClient(), id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const album = await loadAlbum(id);
  return album ? { title: album.title } : {};
}

export default async function AlbumPage({ params }: Props) {
  const { id } = await params;
  const album = await loadAlbum(id);
  if (!album) notFound();

  const supabase = await createClient();
  const downloadedIds = await getMyDownloadedTrackIds(
    supabase,
    album.tracks.map((t) => t.id),
  );
  const artist = albumArtistLabel(album.artistNames);

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
      <DownloadsProvider initialIds={downloadedIds}>
        <AlbumTracks tracks={album.tracks} />
      </DownloadsProvider>
    </Page>
  );
}
