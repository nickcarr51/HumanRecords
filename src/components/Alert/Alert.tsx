'use client';

import styled from 'styled-components';
import type { AppTheme } from '@/lib/theme/theme';

type Tone = 'success' | 'error' | 'warning' | 'info';

const toneColor = (tone: Tone, colors: AppTheme['colors']) =>
  ({
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
  })[tone];

export const Alert = styled.div<{ $tone?: Tone }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  border-left: 3px solid
    ${({ theme, $tone = 'info' }) => toneColor($tone, theme.colors)};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.space.md};
`;
