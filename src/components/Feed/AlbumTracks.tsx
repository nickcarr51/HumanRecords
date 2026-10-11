'use client';

import { usePlayer, toPlayerTrack, type PlayerTrack, type QueueSource } from '@/components/Player';
import { PlaybackButton } from '@/components/Player/PlaybackButton';
import { PlaybackIcon } from '@/components/Player/PlaybackIcon';
import { DownloadButton } from '@/components/Downloads';
import type { FeedTrack } from '@/lib/supabase/feed';
import { Row, Meta, Title, Sub, Empty } from './feed.styles';
import { usePlayButton } from './usePlayButton';
import { CatalogLine } from '@/components/CatalogId/CatalogLine';

export function AlbumTracks({
  tracks,
  queue,
  queueStart = 0,
  source,
  albumId,
}: {
  tracks: FeedTrack[];
  // In the feed: the page's queue, this album's first index in it, and the feed source.
  // On the album page these are omitted: the album is its own queue and
  // continues into the feed after it (albumId).
  queue?: PlayerTrack[];
  queueStart?: number;
  source?: QueueSource;
  albumId?: string;
}) {
  if (tracks.length === 0) return <Empty>No tracks in this album yet.</Empty>;

  const playable = queue ?? tracks.map((t) => toPlayerTrack(t));
  const playSource: QueueSource | undefined = queue ? source : albumId ? { kind: 'album', albumId } : undefined;

  return (
    <div>
      {tracks.map((t, i) => (
        <AlbumTrackRow key={t.id} track={t} slot={i + 1} total={tracks.length} queue={playable} queueIndex={queueStart + i} source={playSource} />
      ))}
    </div>
  );
}

function AlbumTrackRow({
  track,
  slot,
  total,
  queue,
  queueIndex,
  source,
}: {
  track: FeedTrack;
  slot: number;
  total: number;
  queue: PlayerTrack[];
  queueIndex: number;
  source?: QueueSource;
}) {
  const { playQueue } = usePlayer();
  const { playing, activePlaying, onClick } = usePlayButton([track.id], () => playQueue(queue, queueIndex, source));

  return (
    <Row>
      <PlaybackButton active={activePlaying}
        type="button"
        aria-label={`${playing ? 'Pause' : 'Play'} ${track.title}`}
        onClick={onClick}
      >
        <PlaybackIcon playing={playing} />
      </PlaybackButton>
      <Meta>
        <CatalogLine kind="track" number={track.catalogNumber} slot={slot} total={total} />
        <Title>{track.title}</Title>
        <Sub>{track.artistNames.length ? track.artistNames.join(', ') : 'Unknown Artist'}</Sub>
      </Meta>
      <DownloadButton trackId={track.id} title={track.title} />
    </Row>
  );
}
