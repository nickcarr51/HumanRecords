'use client';

import styled from 'styled-components';
import type { SpaceKey } from '@/lib/theme/theme';

export const Grid = styled.div<{ $cols?: number; $gap?: SpaceKey; $min?: string }>`
  display: grid;
  gap: ${({ theme, $gap = 'md' }) => theme.space[$gap]};
  grid-template-columns: ${({ $cols, $min = '220px' }) =>
    $cols ? `repeat(${$cols}, 1fr)` : `repeat(auto-fill, minmax(${$min}, 1fr))`};
`;
