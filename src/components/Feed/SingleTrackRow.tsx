'use client';

import { usePlayer, toPlayerTrack } from '@/components/Player';
import type { FeedItem } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Kind } from './feed.styles';

export function SingleTrackRow({ item }: { item: Extract<FeedItem, { kind: 'track' }> }) {
  const { playQueue } = usePlayer();
  const track = toPlayerTrack({ id: item.id, title: item.title, artistNames: item.artistNames });

  return (
    <Row>
      <PlayButton
        type="button"
        aria-label={`Play ${item.title}`}
        onClick={() => playQueue([track], 0)}
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
