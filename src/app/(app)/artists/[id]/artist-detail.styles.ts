'use client';

import Link from 'next/link';
import styled from 'styled-components';

export const Page = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.lg};
`;

export const Back = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  &:hover { color: ${({ theme }) => theme.colors.accent}; }
`;

export const Head = styled.header`
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: ${({ theme }) => theme.space.lg};
  align-items: center;
  margin: ${({ theme }) => theme.space.lg} 0 ${({ theme }) => theme.space.xl};
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    grid-template-columns: 1fr;
  }
`;

export const Photo = styled.img`
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: ${({ theme }) => theme.radii.md};
`;

export const Tile = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  background: ${({ theme }) => theme.colors.raised};
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  border-radius: ${({ theme }) => theme.radii.md};
`;

export const Name = styled.h1`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.space.xs};
`;

export const Bio = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 ${({ theme }) => theme.space.sm};
  max-width: 60ch;
`;

export const Count = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.faint};
`;

export const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.space.md};
`;

export const TrackRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

export const TrackTitle = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  color: ${({ theme }) => theme.colors.text};
`;

export const TrackAlbum = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.faint};
`;

// Reserved slot for the universal player control (Worktree B).
export const PlaySlot = styled.span`
  width: 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.faint};
`;

export const Empty = styled.p`
  color: ${({ theme }) => theme.colors.muted};
`;
