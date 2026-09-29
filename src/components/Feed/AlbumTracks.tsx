'use client';

import { usePlayer, toPlayerTrack } from '@/components/Player';
import type { FeedTrack } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Empty } from './feed.styles';

export function AlbumTracks({ tracks }: { tracks: FeedTrack[] }) {
  const { playQueue } = usePlayer();

  if (tracks.length === 0) return <Empty>No tracks in this album yet.</Empty>;

  const queue = tracks.map(toPlayerTrack);

  return (
    <div>
      {tracks.map((t, i) => (
        <Row key={t.id}>
          <PlayButton
            type="button"
            aria-label={`Play ${t.title}`}
            onClick={() => playQueue(queue, i)}
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
