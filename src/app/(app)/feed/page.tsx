import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getFeed } from '@/lib/supabase/feed';
import { FeedList, FollowPlayingPage, Pagination, SearchInput } from '@/components';
import { pageHref } from '@/components/Pagination/pageHref';
import { parsePage } from './params';
import { Page, Header, Scroll, Foot } from './feed-page.styles';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const page = parsePage(sp.page);

  const supabase = await createClient();
  const feed = await getFeed(supabase, { page, q });

  // A page past the end (stale link, hand-typed URL, shrunken results) goes
  // to the last real page instead of an empty list.
  if (page > feed.totalPages) redirect(pageHref('/feed', q, feed.totalPages));

  return (
    <Page>
      <Header>
        <SearchInput initialQuery={q} label="Search artists, tracks, albums" />
      </Header>
      {/* Keyed so a new page or search starts scrolled to the top. */}
      <Scroll key={`${q}|${page}`}>
        <FeedList
          items={feed.items}
          source={{ kind: 'feed', q, lastPage: page, hasMore: feed.hasMore }}
          emptyMessage={q ? `No results for "${q}"` : undefined}
        />
      </Scroll>
      <Foot>
        <Pagination basePath="/feed" query={q} page={page} totalPages={feed.totalPages} />
      </Foot>
      <FollowPlayingPage viewedPage={page} q={q} />
    </Page>
  );
}
