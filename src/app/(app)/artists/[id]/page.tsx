import Link from 'next/link';
import { notFound } from 'next/navigation';
import styled from 'styled-components';
import { createClient } from '@/lib/supabase/server';
import { getArtist } from '@/lib/supabase/artists';
import { initials } from '@/components';

const Page = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.lg};
`;

const Back = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  &:hover { color: ${({ theme }) => theme.colors.accent}; }
`;

const Head = styled.header`
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: ${({ theme }) => theme.space.lg};
  align-items: center;
  margin: ${({ theme }) => theme.space.lg} 0 ${({ theme }) => theme.space.xl};
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    grid-template-columns: 1fr;
  }
`;

const Photo = styled.img`
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: ${({ theme }) => theme.radii.md};
`;

const Tile = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  background: ${({ theme }) => theme.colors.raised};
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const Name = styled.h1`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.space.xs};
`;

const Bio = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 ${({ theme }) => theme.space.sm};
  max-width: 60ch;
`;

const Count = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.faint};
`;

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.space.md};
`;

const TrackRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const TrackTitle = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  color: ${({ theme }) => theme.colors.text};
`;

const TrackAlbum = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.faint};
`;

// Reserved slot for the universal player control (Worktree B).
const PlaySlot = styled.span`
  width: 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.faint};
`;

const Empty = styled.p`
  color: ${({ theme }) => theme.colors.muted};
`;

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
