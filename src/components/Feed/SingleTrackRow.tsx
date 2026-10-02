'use client';

import { usePlayer, toPlayerTrack, type PlayerTrack } from '@/components/Player';
import type { FeedItem } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Kind } from './feed.styles';

export function SingleTrackRow({
  item,
  queue,
  queueIndex,
}: {
  item: Extract<FeedItem, { kind: 'track' }>;
  // The feed-wide queue and this track's position in it (see FeedList).
  queue: PlayerTrack[];
  queueIndex: number;
}) {
  const { playQueue } = usePlayer();
  const track = toPlayerTrack({ id: item.id, title: item.title, artistNames: item.artistNames });

  return (
    <Row>
      <PlayButton
        type="button"
        aria-label={`Play ${item.title}`}
        onClick={() => playQueue(queue, queueIndex)}
      >
        ▶
      </PlayButton>
      <Meta>
        <Title>{item.title}</Title>
        <Sub>{track.artistName}</Sub>
      </Meta>
      <Kind>Track</Kind>
    </Row>
  );
}
