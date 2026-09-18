import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getArtist } from '@/lib/supabase/artists';
import { initials } from '@/lib/initials';
import {
  Page,
  TopBar,
  Back,
  Body,
  Panel,
  Identity,
  IdentityText,
  Photo,
  Tile,
  Name,
  Bio,
  Count,
  TrackPanel,
  SectionTitle,
  TrackList,
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
      <TopBar>
        <Back href="/artists">‹ all artists</Back>
      </TopBar>

      <Body>
        <Panel>
          <Identity>
            {artist.photoUrl ? (
              <Photo src={artist.photoUrl} alt="" />
            ) : (
              <Tile aria-hidden>{initials(artist.name)}</Tile>
            )}
            <IdentityText>
              <Name>{artist.name}</Name>
              <Count>
                {count} {count === 1 ? 'track' : 'tracks'}
              </Count>
            </IdentityText>
          </Identity>
          {artist.bio ? <Bio>{artist.bio}</Bio> : null}
        </Panel>

        <TrackPanel>
          <SectionTitle>Tracks</SectionTitle>
          <TrackList>
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
          </TrackList>
        </TrackPanel>
      </Body>
    </Page>
  );
}
