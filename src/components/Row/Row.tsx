'use client';

import styled from 'styled-components';
import type { SpaceKey } from '@/lib/theme/theme';

export const Row = styled.div<{
  $gap?: SpaceKey;
  $align?: string;
  $justify?: string;
  $wrap?: boolean;
}>`
  display: flex;
  flex-direction: row;
  align-items: ${({ $align = 'center' }) => $align};
  justify-content: ${({ $justify = 'flex-start' }) => $justify};
  flex-wrap: ${({ $wrap }) => ($wrap ? 'wrap' : 'nowrap')};
  gap: ${({ theme, $gap = 'md' }) => theme.space[$gap]};
`;
