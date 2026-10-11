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
  mode: 'light',
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

export type AppTheme = Omit<typeof theme, 'colors' | 'mode'> & {
  mode: 'light' | 'dark';
  colors: { [K in keyof typeof theme.colors]: string };
};
export const amberTheme: AppTheme = {
  ...theme,
  mode: 'dark',
  colors: {
    bg: '#15110b', surface: '#15110b', raised: '#241b0d',
    text: '#ffd18a', muted: '#d0a86c', faint: '#ba945a', border: '#8b6635',
    accent: '#ffb642', accentDim: '#e59b2c',
    success: '#ffd18a', error: '#ffb642', warning: '#ffb642', info: '#d0a86c',
  },
};
export type SpaceKey = keyof AppTheme['space'];
