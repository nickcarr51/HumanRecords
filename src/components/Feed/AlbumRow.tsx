'use client';

import { useId, useState } from 'react';
import styled from 'styled-components';
import { usePlayer, type PlayerTrack, type QueueSource } from '@/components/Player';
import { PlaybackButton } from '@/components/Player/PlaybackButton';
import { PlaybackIcon } from '@/components/Player/PlaybackIcon';
import { SweepIcon } from '@/components/Player/SweepIcon';
import type { FeedItem } from '@/lib/supabase/feed';
import { Row, PlayButton, AlbumLink, Meta, Title, Sub, Kind, RowActions, ExpandArea } from './feed.styles';
import { AlbumTracks } from './AlbumTracks';
import { usePlayButton } from './usePlayButton';
import { albumArtistLabel } from '@/lib/supabase/artist-names';
import { PixelAccordion } from './PixelAccordion';
import { CatalogLine } from '@/components/CatalogId/CatalogLine';

const Chevron = styled(SweepIcon)<{ $expanded: boolean }>`
  transform: rotate(${({ $expanded }) => $expanded ? '180deg' : '0deg'});
  transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export function AlbumRow({
  item,
  queue,
  queueStart,
  source,
}: {
  item: Extract<FeedItem, { kind: 'album' }>;
  // The feed-wide queue and the index of this album's first track in it.
  queue: PlayerTrack[];
  queueStart: number;
  source?: QueueSource;
}) {
  const { playQueue } = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const hasTracks = item.tracks.length > 0;
  const artist = albumArtistLabel(item.artistNames);
  const { playing, activePlaying, onClick } = usePlayButton(
    item.tracks.map((t) => t.id),
    () => playQueue(queue, queueStart, source),
  );

  return (
    <div>
      <Row>
        <PlaybackButton active={activePlaying}
          type="button"
          aria-label={playing ? 'Pause album' : 'Play album'}
          disabled={!hasTracks}
          onClick={onClick}
        >
          <PlaybackIcon playing={playing} />
        </PlaybackButton>
        <Meta>
          <CatalogLine kind="album" number={item.catalogNumber} issuedAt={item.createdAt} total={item.tracks.length} />
          <Title>{item.title}</Title>
          <Sub>
            {artist}
          </Sub>
        </Meta>
        <RowActions>
          <Kind>Pack</Kind>
          <PlayButton
            type="button"
            aria-label={expanded ? 'Collapse tracks' : 'Expand tracks'}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
          >
            <Chevron $expanded={expanded} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
              <path d="m6 9 6 6 6-6" />
            </Chevron>
          </PlayButton>
          <AlbumLink href={`/albums/${item.id}`} aria-label={`Open album ${item.title}`}>
            <SweepIcon fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M6 18 18 6M6 6h12v12" />
            </SweepIcon>
          </AlbumLink>
        </RowActions>
      </Row>
      <PixelAccordion open={expanded} id={panelId}>
        <ExpandArea>
          <AlbumTracks tracks={item.tracks} queue={queue} queueStart={queueStart} source={source} />
        </ExpandArea>
      </PixelAccordion>
    </div>
  );
}
