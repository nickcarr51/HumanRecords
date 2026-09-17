import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getArtist } from '@/lib/supabase/artists';
import { initials } from '@/components';
import {
  Page,
  Back,
  Head,
  Photo,
  Tile,
  Name,
  Bio,
  Count,
  SectionTitle,
  TrackRow,
  TrackTitle,
  TrackAlbum,
  PlaySlot,
  Empty,
} from './artist-detail.styles';

export default async function ArtistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const artist = await getArtist(supabase, id);
  if (!artist) notFound();

  const count = artist.tracks.length;

  return (
    <Page>
      <Back href="/artists">‹ artists</Back>
      <Head>
        {artist.photoUrl ? (
          <Photo src={artist.photoUrl} alt="" />
        ) : (
          <Tile aria-hidden>{initials(artist.name)}</Tile>
        )}
        <div>
          <Name>{artist.name}</Name>
          {artist.bio ? <Bio>{artist.bio}</Bio> : null}
          <Count>
            {count} {count === 1 ? 'track' : 'tracks'}
          </Count>
        </div>
      </Head>

      <SectionTitle>Tracks</SectionTitle>
      {count === 0 ? (
        <Empty>No tracks yet.</Empty>
      ) : (
        artist.tracks.map((t) => (
          <TrackRow key={t.id}>
            <TrackTitle>{t.title}</TrackTitle>
            <TrackAlbum>{t.albumTitle ?? '—'}</TrackAlbum>
            <PlaySlot aria-hidden>⌁</PlaySlot>
          </TrackRow>
        ))
      )}
    </Page>
  );
}
