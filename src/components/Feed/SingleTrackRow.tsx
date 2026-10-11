'use client';

import { usePlayer, toPlayerTrack, type PlayerTrack } from '@/components/Player';
import { PlaybackIcon } from '@/components/Player/PlaybackIcon';
import { DownloadButton } from '@/components/Downloads';
import type { FeedItem } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Kind, RowActions } from './feed.styles';
import { usePlayButton } from './usePlayButton';

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
  const { playing, onClick } = usePlayButton([item.id], () => playQueue(queue, queueIndex));

  return (
    <Row>
      <PlayButton
        type="button"
        aria-label={`${playing ? 'Pause' : 'Play'} ${item.title}`}
        onClick={onClick}
      >
        <PlaybackIcon playing={playing} />
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
