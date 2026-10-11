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
    > :first-child {
      grid-column: 1;
      grid-row: 2;
      align-self: center;
    }
    /* Share rows with the metadata so the play control follows the title,
       including titles that wrap onto multiple lines. */
    > :nth-child(2) {
      display: contents;
      > * { grid-column: 2; }
      > :first-child { grid-row: 1; }
      > :nth-child(2) { grid-row: 2; align-self: center; }
      > :nth-child(3) { grid-row: 3; }
    }
    > :last-child {
      grid-column: 2;
      grid-row: 4;
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
  position: relative;
  margin: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md} ${({ theme }) => theme.space.xl};
  padding: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.md};
  background: ${({ theme }) => theme.colors.raised};
  border-left: 1px solid ${({ theme }) => theme.colors.border}40;
  &::before, &::after {
    content: '';
    position: absolute;
    width: 3px;
    height: 3px;
    background: ${({ theme }) => theme.colors.muted};
    opacity: 0.5;
    pointer-events: none;
  }
  &::before {
    top: 0;
    left: 0;
    box-shadow: 3px 0 currentColor, 0 3px currentColor;
    color: ${({ theme }) => theme.colors.muted};
  }
  &::after {
    bottom: 0;
    right: 0;
    box-shadow: -3px 0 currentColor, 0 -3px currentColor;
    color: ${({ theme }) => theme.colors.muted};
  }
  ${Row}:last-child { border-bottom: 0; }
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    margin-left: ${({ theme }) => theme.space.md};
    padding-inline: ${({ theme }) => theme.space.sm};
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
