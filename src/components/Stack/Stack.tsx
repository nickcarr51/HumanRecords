'use client';

import styled from 'styled-components';
import type { SpaceKey } from '@/lib/theme/theme';

export const Stack = styled.div<{ $gap?: SpaceKey }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $gap = 'md' }) => theme.space[$gap]};
`;
