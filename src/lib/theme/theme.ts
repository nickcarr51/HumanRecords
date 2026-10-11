import {
  palette,
  paletteAmber,
  effects,
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
  effects: effects.light,
} as const;

export type AppTheme = Omit<typeof theme, 'colors' | 'mode' | 'effects'> & {
  mode: 'light' | 'dark';
  colors: { [K in keyof typeof theme.colors]: string };
  effects: { [K in keyof typeof theme.effects]: string };
};
export const amberTheme: AppTheme = {
  ...theme,
  mode: 'dark',
  colors: {
    bg: paletteAmber.bgBase,
    surface: paletteAmber.surface,
    raised: paletteAmber.raised,
    text: paletteAmber.text,
    muted: paletteAmber.muted,
    faint: paletteAmber.faint,
    border: paletteAmber.border,
    accent: paletteAmber.accent,
    accentDim: paletteAmber.accentDim,
    success: paletteAmber.success,
    error: paletteAmber.error,
    warning: paletteAmber.warning,
    info: paletteAmber.info,
  },
  effects: effects.dark,
};
export type SpaceKey = keyof AppTheme['space'];
