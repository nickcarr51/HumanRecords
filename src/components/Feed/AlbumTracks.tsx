'use client';

import { usePlayer, toPlayerTrack, type PlayerTrack } from '@/components/Player';
import type { FeedTrack } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Empty } from './feed.styles';

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
  const { playQueue } = usePlayer();

  if (tracks.length === 0) return <Empty>No tracks in this album yet.</Empty>;

  const playable = queue ?? tracks.map(toPlayerTrack);

  return (
    <div>
      {tracks.map((t, i) => (
        <Row key={t.id}>
          <PlayButton
            type="button"
            aria-label={`Play ${t.title}`}
            onClick={() => playQueue(playable, queueStart + i)}
          >
            ▶
          </PlayButton>
          <Meta>
            <Title>{t.title}</Title>
            <Sub>{t.artistNames.length ? t.artistNames.join(', ') : 'Unknown Artist'}</Sub>
          </Meta>
          <span />
        </Row>
      ))}
    </div>
  );
}
