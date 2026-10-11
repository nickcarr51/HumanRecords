import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getFeed } from '@/lib/supabase/feed';
import { feedTrackIds, getMyDownloadedTrackIds } from '@/lib/supabase/downloads';
import { Heading, FeedList, DownloadsProvider } from '@/components';
import { Page, Header, Scroll } from './feed-page.styles';

export const metadata: Metadata = { title: 'Feed' };

export default async function FeedPage() {
  const supabase = await createClient();
  const { items } = await getFeed(supabase, { page: 1 });
  const downloadedIds = await getMyDownloadedTrackIds(supabase, feedTrackIds(items));

  return (
    <Page>
      <Header>
        <Heading $level={2}>Timeline</Heading>
      </Header>
      <Scroll>
        <DownloadsProvider initialIds={downloadedIds}>
          <FeedList items={items} />
        </DownloadsProvider>
      </Scroll>
    </Page>
  );
}
