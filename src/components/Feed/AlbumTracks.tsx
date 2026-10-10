'use client';

import { usePlayer, toPlayerTrack, type PlayerTrack, type QueueSource } from '@/components/Player';
import type { FeedTrack } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Empty } from './feed.styles';
import { usePlayButton } from './usePlayButton';

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
        <AlbumTrackRow key={t.id} track={t} queue={playable} queueIndex={queueStart + i} source={playSource} />
      ))}
    </div>
  );
}

function AlbumTrackRow({
  track,
  queue,
  queueIndex,
  source,
}: {
  track: FeedTrack;
  queue: PlayerTrack[];
  queueIndex: number;
  source?: QueueSource;
}) {
  const { playQueue } = usePlayer();
  const { playing, onClick } = usePlayButton([track.id], () => playQueue(queue, queueIndex, source));

  return (
    <Row>
      <PlayButton
        type="button"
        aria-label={`${playing ? 'Pause' : 'Play'} ${track.title}`}
        onClick={onClick}
      >
        {playing ? '⏸' : '▶'}
      </PlayButton>
      <Meta>
        <Title>{track.title}</Title>
        <Sub>{track.artistNames.length ? track.artistNames.join(', ') : 'Unknown Artist'}</Sub>
      </Meta>
      <span />
    </Row>
  );
}
