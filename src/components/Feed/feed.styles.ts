'use client';

import styled, { css } from 'styled-components';
import Link from 'next/link';
import { iconSweepStyles } from '@/components/field/hoverStyles';

export const Row = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
    > :last-child {
      grid-column: 2;
      justify-self: end;
    }
  }
`;

const circularControlStyles = css`
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
  flex-shrink: 0;
  ${iconSweepStyles}
`;

export const PlayButton = styled.button`
  ${circularControlStyles}
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export const AlbumLink = styled(Link)`
  ${circularControlStyles}
  text-decoration: none;
`;

export const Title = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`;

export const Sub = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

export const Kind = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.faint};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

export const Meta = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

export const ExpandArea = styled.div`
  padding: 0 0 ${({ theme }) => theme.space.md} ${({ theme }) => theme.space.xl};
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding-left: 0;
  }
`;

export const Empty = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  margin: ${({ theme }) => theme.space.md} 0 0;
`;

export const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
`;
