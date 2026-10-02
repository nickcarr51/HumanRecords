'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePlayer, type PlayerTrack } from '@/components/Player';
import type { FeedItem } from '@/lib/supabase/feed';
import { Row, PlayButton, Meta, Title, Sub, Kind, RowActions, ExpandArea } from './feed.styles';
import { AlbumTracks } from './AlbumTracks';
import { albumArtistLabel } from '@/lib/supabase/artist-names';

export function AlbumRow({
  item,
  queue,
  queueStart,
}: {
  item: Extract<FeedItem, { kind: 'album' }>;
  // The feed-wide queue and the index of this album's first track in it.
  queue: PlayerTrack[];
  queueStart: number;
}) {
  const { playQueue } = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const hasTracks = item.tracks.length > 0;
  const artist = albumArtistLabel(item.artistNames);

  return (
    <div>
      <Row>
        <PlayButton
          type="button"
          aria-label="Play album"
          disabled={!hasTracks}
          onClick={() => playQueue(queue, queueStart)}
        >
          ▶
        </PlayButton>
        <Meta>
          <Title>{item.title}</Title>
          <Sub>
            {artist} · {item.tracks.length} {item.tracks.length === 1 ? 'track' : 'tracks'}
          </Sub>
        </Meta>
        <RowActions>
          <Kind>Album</Kind>
          <PlayButton
            type="button"
            aria-label={expanded ? 'Collapse tracks' : 'Expand tracks'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '▲' : '▼'}
          </PlayButton>
          <Link href={`/albums/${item.id}`} aria-label={`Open album ${item.title}`}>
            ↗
          </Link>
        </RowActions>
      </Row>
      {expanded ? (
        <ExpandArea>
          <AlbumTracks tracks={item.tracks} queue={queue} queueStart={queueStart} />
        </ExpandArea>
      ) : null}
    </div>
  );
}
