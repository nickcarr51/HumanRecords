'use client';

import styled from 'styled-components';
import { textSweepStyles } from '@/components/field/hoverStyles';

export const Link = styled.a`
  font-family: ${({ theme }) => theme.fonts.mono};
  text-decoration: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.text};
  ${textSweepStyles}
  &:hover {
    border-bottom-color: ${({ theme }) => theme.colors.accent};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: 2px;
  }
`;
