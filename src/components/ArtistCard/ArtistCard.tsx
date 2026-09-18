'use client';

import Link from 'next/link';
import styled from 'styled-components';
import { initials } from '@/lib/initials';

// Re-exported so existing consumers importing `initials` from the component
// keep working; the implementation lives in the server-safe '@/lib/initials'.
export { initials };

export type ArtistCardProps = {
  id: string;
  name: string;
  photoUrl: string | null;
  trackCount: number;
};

const Row = styled(Link)`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  text-decoration: none;
  color: inherit;
  transition: color ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease};
  &:hover .artist-name {
    color: ${({ theme }) => theme.colors.accent};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: 2px;
  }
`;

const Thumb = styled.img`
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const Tile = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: ${({ theme }) => theme.colors.raised};
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const Name = styled.span.attrs({ className: 'artist-name' })`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const Meta = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.faint};
  white-space: nowrap;
`;

export function ArtistCard({ id, name, photoUrl, trackCount }: ArtistCardProps) {
  return (
    <Row href={`/artists/${id}`}>
      {photoUrl ? (
        <Thumb src={photoUrl} alt="" />
      ) : (
        <Tile aria-hidden>{initials(name)}</Tile>
      )}
      <Name>{name}</Name>
      <Meta>
        {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
      </Meta>
    </Row>
  );
}
