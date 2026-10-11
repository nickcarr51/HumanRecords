import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getFeed, MAX_QUERY_LENGTH } from '@/lib/supabase/feed';
import { feedTrackIds, getMyDownloadedTrackIds } from '@/lib/supabase/downloads';
import { DownloadsProvider, FeedList, FollowPlayingPage, Pagination, SearchInput } from '@/components';
import { pageHref } from '@/components/Pagination/pageHref';
import { parsePage } from './params';
import { Page, Header, Scroll, Foot } from './feed-page.styles';

export const metadata: Metadata = { title: 'Feed' };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  const page = parsePage(typeof sp.page === 'string' ? sp.page : undefined);

  const supabase = await createClient();
  const feed = await getFeed(supabase, { page, q });

  // A page past the end (stale link, hand-typed URL, shrunken results) goes
  // to the last real page instead of an empty list.
  if (page > feed.totalPages) redirect(pageHref('/feed', q, feed.totalPages));

  const downloadedIds = await getMyDownloadedTrackIds(supabase, feedTrackIds(feed.items));

  return (
    <Page>
      <Header>
        <SearchInput initialQuery={q} label="Search artists, tracks, albums" />
      </Header>
      {/* Keyed so a new page or search starts scrolled to the top. */}
      <Scroll key={`${q}|${page}`}>
        <DownloadsProvider initialIds={downloadedIds}>
          <FeedList
            items={feed.items}
            source={{ kind: 'feed', q, lastPage: page, hasMore: feed.hasMore }}
            emptyMessage={q ? `No results for "${q}"` : undefined}
          />
        </DownloadsProvider>
      </Scroll>
      <Foot>
        <Pagination basePath="/feed" query={q} page={page} totalPages={feed.totalPages} />
      </Foot>
      <FollowPlayingPage viewedPage={page} q={q} />
    </Page>
  );
}
