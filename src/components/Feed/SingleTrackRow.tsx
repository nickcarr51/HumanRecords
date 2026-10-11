'use client';

import { usePlayer, toPlayerTrack, type PlayerTrack, type QueueSource } from '@/components/Player';
import { PlaybackButton } from '@/components/Player/PlaybackButton';
import { PlaybackIcon } from '@/components/Player/PlaybackIcon';
import { DownloadButton } from '@/components/Downloads';
import type { FeedItem } from '@/lib/supabase/feed';
import { Row, Meta, Title, Sub, Kind, RowActions } from './feed.styles';
import { usePlayButton } from './usePlayButton';
import { CatalogLine } from '@/components/CatalogId/CatalogLine';

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
  const { playing, activePlaying, onClick } = usePlayButton([item.id], () => playQueue(queue, queueIndex, source));

  return (
    <Row>
      <PlaybackButton active={activePlaying}
        type="button"
        aria-label={`${playing ? 'Pause' : 'Play'} ${item.title}`}
        onClick={onClick}
      >
        <PlaybackIcon playing={playing} />
      </PlaybackButton>
      <Meta>
        <CatalogLine kind="track" number={item.catalogNumber} issuedAt={item.createdAt} />
        <Title>{item.title}</Title>
        <Sub>{track.artistName}</Sub>
      </Meta>
      <RowActions>
        <Kind>Single</Kind>
        <DownloadButton trackId={item.id} title={item.title} />
      </RowActions>
    </Row>
  );
}
