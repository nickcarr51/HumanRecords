import { createClient } from '@/lib/supabase/server';
import { getFeed } from '@/lib/supabase/feed';
import { Heading, FeedList } from '@/components';
import { Page, Header, Scroll } from './feed-page.styles';

export default async function FeedPage() {
  const supabase = await createClient();
  const { items } = await getFeed(supabase, { page: 1 });

  return (
    <Page>
      <Header>
        <Heading $level={2}>Timeline</Heading>
      </Header>
      <Scroll>
        <FeedList items={items} />
      </Scroll>
    </Page>
  );
}
