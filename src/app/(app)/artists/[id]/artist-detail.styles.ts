'use client';

import Link from 'next/link';
import styled from 'styled-components';

// Fixed-height detail view: a top bar with the back link, then a two-column
// body (left profile panel ~25%, right track list). The page itself does not
// scroll — the track list scrolls on its own. On phones (<= md) it collapses
// to a single scrolling column with a compact photo-beside-name header.
export const Page = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.lg};
  display: flex;
  flex-direction: column;
  box-sizing: border-box;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.space.md};
  }
`;

export const TopBar = styled.div`
  flex-shrink: 0;
  margin-bottom: ${({ theme }) => theme.space.lg};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    margin-bottom: ${({ theme }) => theme.space.md};
  }
`;

export const Back = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.accent};
  }
`;

export const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 3fr;
  gap: ${({ theme }) => theme.space.xl};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    grid-template-columns: 1fr;
    gap: ${({ theme }) => theme.space.lg};
    overflow-y: auto;
  }
`;

export const Panel = styled.aside`
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    overflow-y: visible;
  }
`;

// Photo + name/count. A vertical stack on desktop (big square above the name),
// a horizontal row on phones (small square beside the name).
export const Identity = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    flex-direction: row;
    align-items: center;
    gap: ${({ theme }) => theme.space.md};
  }
`;

export const IdentityText = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  min-width: 0;
`;

export const Photo = styled.img`
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: ${({ theme }) => theme.radii.md};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    width: 88px;
    height: 88px;
    aspect-ratio: auto;
    flex-shrink: 0;
  }
`;

export const Tile = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: ${({ theme }) => theme.colors.raised};
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  border-radius: ${({ theme }) => theme.radii.md};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    width: 88px;
    height: 88px;
    aspect-ratio: auto;
    flex-shrink: 0;
    font-size: ${({ theme }) => theme.fontSizes.xl};
  }
`;

export const Name = styled.h1`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
  line-height: 1.15;
`;

export const Bio = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  line-height: 1.5;
`;

export const Count = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.faint};
`;

export const TrackPanel = styled.section`
  min-height: 0;
  display: flex;
  flex-direction: column;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    min-height: auto;
  }
`;

export const SectionTitle = styled.h2`
  flex-shrink: 0;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.space.sm};
`;

export const TrackList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    overflow-y: visible;
  }
`;

export const TrackRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  grid-template-areas: 'title album play';
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'title play'
      'album play';
    column-gap: ${({ theme }) => theme.space.md};
    row-gap: 2px;
  }
`;

export const TrackTitle = styled.span`
  grid-area: title;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: ${({ theme }) => theme.fonts.display};
  color: ${({ theme }) => theme.colors.text};
`;

export const TrackAlbum = styled.span`
  grid-area: album;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.faint};
`;

// Reserved slot for the universal player control (Worktree B).
export const PlaySlot = styled.span`
  grid-area: play;
  align-self: center;
  width: 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.faint};
`;

export const Empty = styled.p`
  color: ${({ theme }) => theme.colors.muted};
`;
