'use client';

import type { FeedItem } from '@/lib/supabase/feed';
import { SingleTrackRow } from './SingleTrackRow';
import { AlbumRow } from './AlbumRow';
import { Empty } from './feed.styles';

export function FeedList({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return <Empty>Nothing here yet.</Empty>;

  return (
    <div>
      {items.map((item) =>
        item.kind === 'album' ? (
          <AlbumRow key={`album-${item.id}`} item={item} />
        ) : (
          <SingleTrackRow key={`track-${item.id}`} item={item} />
        ),
      )}
    </div>
  );
}
