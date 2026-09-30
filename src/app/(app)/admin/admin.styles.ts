'use client';

import Link from 'next/link';
import styled from 'styled-components';

// Fills AppShell's Main and owns its own scroll (see feed-page.styles.ts).
export const Page = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.lg};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.space.lg} ${({ theme }) => theme.space.md};
  }
`;

export const Back = styled(Link)`
  align-self: flex-start;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  border: 0;
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.accent};
  }
`;

export const ActionCard = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 3px solid ${({ theme }) => theme.colors.accent};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.space.lg};
  transition: border-color ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease};
  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.colors.accent};
    outline: none;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
