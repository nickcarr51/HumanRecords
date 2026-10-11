"use client";

import styled from "styled-components";
import { usePlayer, usePlayerTime } from "./PlayerProvider";
import { PlaybackButton } from './PlaybackButton';
import { PixelWaveform } from './PixelWaveform';
import { CatalogId } from '@/components/CatalogId/CatalogId';
import { PlaybackIcon } from "./PlaybackIcon";
import { SweepIcon } from './SweepIcon';
import { iconSweepStyles } from '@/components/field/hoverStyles';

const Bar = styled.div`
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};

  /* Stack metadata, waveform/transport, and seek on narrow screens. */
  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    grid-template-columns: minmax(0, 1fr);
    row-gap: ${({ theme }) => theme.space.sm};
    padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
    padding-bottom: max(${({ theme }) => theme.space.sm}, env(safe-area-inset-bottom));
  }
`;

const Meta = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const Title = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Artist = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  min-width: 0;
  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    grid-column: 1 / -1;
    width: 100%;
  }
`;

const Transport = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  flex-shrink: 0;
  margin-left: auto;
`;

const IconButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  ${iconSweepStyles}
`;

const Scrubber = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  justify-content: flex-end;
  min-width: 0;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    grid-column: 1 / -1;
    justify-content: stretch;
  }
`;

const Range = styled.input`
  width: 100%;
  max-width: 260px;
  min-width: 0;
  accent-color: ${({ theme }) => theme.colors.accent};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    max-width: none;
    flex: 1;
  }
`;

const Time = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.faint};
  white-space: nowrap;
`;

const ErrorNote = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.error};
`;

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
  const { currentTrack, isPlaying, status, toggle, next, prev, seek } = usePlayer();
  const { currentTime, duration } = usePlayerTime();

  if (!currentTrack) return null;

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrent = Number.isFinite(currentTime) ? Math.min(Math.max(currentTime, 0), safeDuration) : 0;

  return (
    <Bar>
      <Meta>
        <CatalogId kind="track" number={currentTrack.catalogNumber} />
        <Title>{currentTrack.title}</Title>
        {status === "error" ? (
          <ErrorNote>Couldn&apos;t play this track.</ErrorNote>
        ) : (
          <Artist>{currentTrack.artistName}</Artist>
        )}
      </Meta>

      <Controls>
        <PixelWaveform playing={isPlaying && status !== 'error'} status={status} />
        <Transport>
          <IconButton type="button" aria-label="Previous track" onClick={prev}>
            <SweepIcon fill="currentColor"><path d="M17 5 6 12l11 7Z" /><path d="M5 5h2v14H5Z" /></SweepIcon>
          </IconButton>
          <PlaybackButton active={isPlaying && status !== "error"} type="button" aria-label={isPlaying ? "Pause" : "Play"} onClick={toggle}>
            <PlaybackIcon playing={isPlaying} />
          </PlaybackButton>
          <IconButton type="button" aria-label="Next track" onClick={next}>
            <SweepIcon fill="currentColor"><path d="m7 5 11 7-11 7Z" /><path d="M17 5h2v14h-2Z" /></SweepIcon>
          </IconButton>
        </Transport>
      </Controls>

      <Scrubber>
        <Time>{fmt(currentTime)}</Time>
        <Range
          type="range"
          aria-label="Seek"
          min={0}
          max={safeDuration}
          step={1}
          value={safeCurrent}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <Time>{fmt(duration)}</Time>
      </Scrubber>
    </Bar>
  );
}
