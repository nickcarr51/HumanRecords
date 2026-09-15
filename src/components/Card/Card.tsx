'use client';

import styled from 'styled-components';

export const Card = styled.div<{ $interactive?: boolean }>`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.space.lg};
  transition:
    border-color ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease},
    transform ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease};
  ${({ $interactive, theme }) =>
    $interactive &&
    `
    cursor: pointer;
    &:hover {
      border-color: ${theme.colors.accent};
      transform: translateY(-2px);
    }
    @media (prefers-reduced-motion: reduce) {
      &:hover { transform: none; }
    }
  `}
`;
