'use client';

import styled from 'styled-components';
import type { AppTheme } from '@/lib/theme/theme';

type Tone = 'default' | 'accent' | 'success' | 'error' | 'warning' | 'info';

const toneColor = (tone: Tone, colors: AppTheme['colors']) =>
  ({
    default: colors.muted,
    accent: colors.accent,
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
  })[tone];

export const Tag = styled.span<{ $tone?: Tone }>`
  display: inline-block;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  letter-spacing: 0.15em;
  text-transform: uppercase;
  padding: 0.2rem 0.6rem;
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme, $tone = 'default' }) => toneColor($tone, theme.colors)};
  border: 1px solid
    ${({ theme, $tone = 'default' }) => toneColor($tone, theme.colors)};
`;
