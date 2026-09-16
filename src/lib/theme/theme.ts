import {
  palette,
  space,
  fontSizes,
  fonts,
  fontWeights,
  radii,
  motion,
  breakpoints,
  zIndex,
} from './tokens';

export const theme = {
  colors: {
    bg: palette.bgBase,
    surface: palette.surface,
    raised: palette.raised,
    text: palette.text,
    muted: palette.muted,
    faint: palette.faint,
    border: palette.border,
    accent: palette.accent,
    accentDim: palette.accentDim,
    success: palette.success,
    error: palette.error,
    warning: palette.warning,
    info: palette.info,
  },
  space,
  fontSizes,
  fonts,
  fontWeights,
  radii,
  motion,
  breakpoints,
  zIndex,
} as const;

export type AppTheme = typeof theme;
export type SpaceKey = keyof AppTheme['space'];
