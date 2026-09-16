'use client';

import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const Spinner = styled.span<{ $size?: string }>`
  display: inline-block;
  width: ${({ $size = '1.25rem' }) => $size};
  height: ${({ $size = '1.25rem' }) => $size};
  border: 2px solid ${({ theme }) => theme.colors.border};
  border-top-color: ${({ theme }) => theme.colors.accent};
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
  @media (prefers-reduced-motion: reduce) {
    animation-duration: 1.5s;
  }
`;
