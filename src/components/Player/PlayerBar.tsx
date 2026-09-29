"use client";

import styled from "styled-components";
import { usePlayer } from "./PlayerProvider";

const Bar = styled.div`
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};

  /* On phones, drop the scrubber onto its own full-width row below meta+controls. */
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    grid-template-columns: 1fr auto;
    row-gap: ${({ theme }) => theme.space.sm};
  }
`;

const Meta = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const Title = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
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
`;

const IconButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  &:hover:not(:disabled),
  &:focus-visible {
    border-color: ${({ theme }) => theme.colors.accent};
    color: ${({ theme }) => theme.colors.accent};
  }
`;

const Scrubber = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  justify-content: flex-end;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    grid-column: 1 / -1;
    justify-content: stretch;
  }
`;

const Range = styled.input`
  width: 100%;
  max-width: 260px;
  accent-color: ${({ theme }) => theme.colors.accent};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
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
  const { currentTrack, isPlaying, currentTime, duration, status, toggle, next, prev, seek } =
    usePlayer();

  if (!currentTrack) return null;

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrent = Number.isFinite(currentTime) ? Math.min(Math.max(currentTime, 0), safeDuration) : 0;

  return (
    <Bar>
      <Meta>
        <Title>{currentTrack.title}</Title>
        {status === "error" ? (
          <ErrorNote>Couldn&apos;t play this track.</ErrorNote>
        ) : (
          <Artist>{currentTrack.artistName}</Artist>
        )}
      </Meta>

      <Controls>
        <IconButton type="button" aria-label="Previous track" onClick={prev}>
          ⏮
        </IconButton>
        <IconButton type="button" aria-label={isPlaying ? "Pause" : "Play"} onClick={toggle}>
          {isPlaying ? "⏸" : "▶"}
        </IconButton>
        <IconButton type="button" aria-label="Next track" onClick={next}>
          ⏭
        </IconButton>
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
