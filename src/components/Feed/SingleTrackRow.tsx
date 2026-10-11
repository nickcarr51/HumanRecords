'use client';

import { usePlayer, toPlayerTrack, type PlayerTrack, type QueueSource } from '@/components/Player';
import { DownloadButton } from '@/components/Downloads';
import type { FeedItem } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Kind, RowActions } from './feed.styles';
import { usePlayButton } from './usePlayButton';

export function SingleTrackRow({
  item,
  queue,
  queueIndex,
  source,
}: {
  item: Extract<FeedItem, { kind: 'track' }>;
  // The feed-wide queue and this track's position in it (see FeedList).
  queue: PlayerTrack[];
  queueIndex: number;
  source?: QueueSource;
}) {
  const { playQueue } = usePlayer();
  const track = toPlayerTrack({ id: item.id, title: item.title, artistNames: item.artistNames });
  const { playing, onClick } = usePlayButton([item.id], () => playQueue(queue, queueIndex, source));

  return (
    <Row>
      <PlayButton
        type="button"
        aria-label={`${playing ? 'Pause' : 'Play'} ${item.title}`}
        onClick={onClick}
      >
        {playing ? '⏸' : '▶'}
      </PlayButton>
      <Meta>
        <Title>{item.title}</Title>
        <Sub>{track.artistName}</Sub>
      </Meta>
      <RowActions>
        <Kind>Track</Kind>
        <DownloadButton trackId={item.id} title={item.title} />
      </RowActions>
    </Row>
  );
}
