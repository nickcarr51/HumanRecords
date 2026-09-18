import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getArtists } from '@/lib/supabase/artists';
import { ArtistCard, Heading } from '@/components';
import { SearchInput } from './SearchInput';
import { Pagination } from './Pagination';
import { Page, Header, SearchSlot, List, Empty, Foot } from './artists.styles';

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? '').trim();
  const requestedPage = Number(sp.page);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;

  const supabase = await createClient();
  const { artists, total, pageSize } = await getArtists(supabase, { query, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // A page past the end (stale link, hand-typed URL, or shrunken data) would
  // otherwise render an empty "no artists" state with an N-of-M pager where
  // N > M. Send the user to the last real page instead.
  if (total > 0 && page > totalPages) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (totalPages > 1) params.set('page', String(totalPages));
    const qs = params.toString();
    redirect(qs ? `/artists?${qs}` : '/artists');
  }

  return (
    <Page>
      <Header>
        <Heading $level={2}>Artists</Heading>
        <SearchSlot>
          <SearchInput initialQuery={query} />
        </SearchSlot>
      </Header>

      <List>
        {artists.length === 0 ? (
          <Empty>
            {query ? `No artists match "${query}".` : 'No artists yet.'}
          </Empty>
        ) : (
          artists.map((a) => (
            <ArtistCard
              key={a.id}
              id={a.id}
              name={a.name}
              photoUrl={a.photoUrl}
              trackCount={a.trackCount}
            />
          ))
        )}
      </List>

      <Foot>
        <Pagination query={query} page={page} totalPages={totalPages} />
      </Foot>
    </Page>
  );
}
