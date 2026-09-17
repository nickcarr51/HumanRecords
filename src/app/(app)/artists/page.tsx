import { createClient } from '@/lib/supabase/server';
import { getArtists } from '@/lib/supabase/artists';
import { ArtistCard, Heading, Text } from '@/components';
import { SearchInput } from './SearchInput';
import { Pagination } from './Pagination';
import { Page, Header, SearchSlot, List } from './artists.styles';

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? '').trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await createClient();
  const { artists, total, pageSize } = await getArtists(supabase, { query, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Page>
      <Header>
        <Heading $level={2}>Artists</Heading>
        <SearchSlot>
          <SearchInput initialQuery={query} />
        </SearchSlot>
      </Header>

      {artists.length === 0 ? (
        <Text $variant="muted">
          {query ? `No artists match "${query}".` : 'No artists yet.'}
        </Text>
      ) : (
        <List>
          {artists.map((a) => (
            <ArtistCard
              key={a.id}
              id={a.id}
              name={a.name}
              photoUrl={a.photoUrl}
              trackCount={a.trackCount}
            />
          ))}
        </List>
      )}

      <Pagination query={query} page={page} totalPages={totalPages} />
    </Page>
  );
}
