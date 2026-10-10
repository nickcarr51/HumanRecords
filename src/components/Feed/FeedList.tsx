'use client';

import { feedQueue, type QueueSource } from '@/components/Player/queue';
import type { FeedItem } from '@/lib/supabase/feed';
import { SingleTrackRow } from './SingleTrackRow';
import { AlbumRow } from './AlbumRow';
import { Empty } from './feed.styles';

export function FeedList({
  items,
  source,
  emptyMessage = 'Nothing here yet.',
}: {
  items: FeedItem[];
  // Which feed page (and search) this list is, so the player can continue past it.
  source?: Extract<QueueSource, { kind: 'feed' }>;
  emptyMessage?: string;
}) {
  if (items.length === 0) return <Empty>{emptyMessage}</Empty>;

  // One queue for the whole page, in feed order, so next/prev move from
  // release to release. Each row starts playback at its own offset into it.
  const { tracks: queue, offsets } = feedQueue(items, source?.lastPage);

  return (
    <div>
      {items.map((item, i) =>
        item.kind === 'album' ? (
          <AlbumRow key={`album-${item.id}`} item={item} queue={queue} queueStart={offsets[i]} source={source} />
        ) : (
          <SingleTrackRow key={`track-${item.id}`} item={item} queue={queue} queueIndex={offsets[i]} source={source} />
        ),
      )}
    </div>
  );
}
