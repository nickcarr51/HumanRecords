'use client';

import { toPlayerTrack, type PlayerTrack } from '@/components/Player';
import type { FeedItem } from '@/lib/supabase/feed';
import { SingleTrackRow } from './SingleTrackRow';
import { AlbumRow } from './AlbumRow';
import { Empty } from './feed.styles';

export function FeedList({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return <Empty>Nothing here yet.</Empty>;

  // One queue for the whole timeline, in feed order, so next/prev move from
  // release to release. Each row starts playback at its own offset into it.
  const queue: PlayerTrack[] = [];
  const offsets: number[] = [];
  for (const item of items) {
    offsets.push(queue.length);
    if (item.kind === 'album') queue.push(...item.tracks.map(toPlayerTrack));
    else queue.push(toPlayerTrack(item));
  }

  return (
    <div>
      {items.map((item, i) =>
        item.kind === 'album' ? (
          <AlbumRow key={`album-${item.id}`} item={item} queue={queue} queueStart={offsets[i]} />
        ) : (
          <SingleTrackRow key={`track-${item.id}`} item={item} queue={queue} queueIndex={offsets[i]} />
        ),
      )}
    </div>
  );
}
