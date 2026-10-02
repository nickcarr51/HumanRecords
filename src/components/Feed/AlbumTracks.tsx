'use client';

import { usePlayer, toPlayerTrack, type PlayerTrack } from '@/components/Player';
import type { FeedTrack } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Empty } from './feed.styles';
import { usePlayButton } from './usePlayButton';

export function AlbumTracks({
  tracks,
  queue,
  queueStart = 0,
}: {
  tracks: FeedTrack[];
  // In the feed: the feed-wide queue and this album's first index in it.
  // On the album page these are omitted and the album is its own queue.
  queue?: PlayerTrack[];
  queueStart?: number;
}) {
  if (tracks.length === 0) return <Empty>No tracks in this album yet.</Empty>;

  const playable = queue ?? tracks.map(toPlayerTrack);

  return (
    <div>
      {tracks.map((t, i) => (
        <AlbumTrackRow key={t.id} track={t} queue={playable} queueIndex={queueStart + i} />
      ))}
    </div>
  );
}

function AlbumTrackRow({
  track,
  queue,
  queueIndex,
}: {
  track: FeedTrack;
  queue: PlayerTrack[];
  queueIndex: number;
}) {
  const { playQueue } = usePlayer();
  const { playing, onClick } = usePlayButton([track.id], () => playQueue(queue, queueIndex));

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
