'use client';

import styled from 'styled-components';

// Fills AppShell's Main and owns its own scroll (see feed-page.styles.ts).
// No bottom padding: the sticky Footer sits flush with the scroll edge.
export const Page = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.lg} 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.space.lg} ${({ theme }) => theme.space.md} 0;
  }
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};
`;

// Positioned so the progress line can run along the card's top edge.
export const TrackCard = styled.div`
  position: relative;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.space.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.space.md};
  }
`;

export const TrackHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.sm};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.accent};
`;

export const TrackControls = styled.span`
  display: inline-flex;
  gap: ${({ theme }) => theme.space.xs};
`;

// The upload's progress, drawn as a line across the top edge of its track card.
export const Progress = styled.div<{ $value: number; $error: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: ${({ theme }) => theme.colors.border};
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $value }) => Math.round($value * 100)}%;
    background: ${({ theme, $error }) => ($error ? theme.colors.error : theme.colors.accent)};
    transition: width ${({ theme }) => theme.motion.slow} ${({ theme }) => theme.motion.ease};
  }
  @media (prefers-reduced-motion: reduce) {
    &::after {
      transition: none;
    }
  }
`;

export const UploadError = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.error};
`;

// Sticky so Publish stays in reach on long albums. "Clear all" sits apart
// on the left, away from Cancel/Publish.
export const Footer = styled.div`
  position: sticky;
  bottom: 0;
  z-index: ${({ theme }) => theme.zIndex.sticky};
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space.sm};
  padding: ${({ theme }) => theme.space.md} 0;
  background: ${({ theme }) => theme.colors.bg};
  border-top: 1px solid ${({ theme }) => theme.colors.border};

  > :first-child {
    margin-right: auto;
  }
`;

export const IconButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  font: inherit;
  line-height: 1;
  min-width: 1.9rem;
  padding: 0.3rem 0.5rem;
  &:hover:not(:disabled),
  &:focus-visible {
    color: ${({ theme }) => theme.colors.accent};
    border-color: ${({ theme }) => theme.colors.accent};
  }
  &:focus-visible {
    outline: none;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;
