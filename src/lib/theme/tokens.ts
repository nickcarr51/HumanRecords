export const palette = {
  bgBase: '#e8e8e8',
  surface: '#e8e8e8',
  raised: '#f2f2f2',
  text: '#111111',
  muted: '#484848',
  faint: '#626262',
  border: '#111111',
  accent: '#ff6b1b',
  accentDim: '#e85b0d',
  success: '#111111',
  error: '#a33800',
  warning: '#a33800',
  info: '#484848',
} as const;

// Night mode ("amber CRT"). Same keys as `palette`; theme.ts maps both.
export const paletteAmber = {
  bgBase: '#15110b',
  surface: '#15110b',
  raised: '#241b0d',
  text: '#ffd18a',
  muted: '#d0a86c',
  faint: '#ba945a',
  border: '#8b6635',
  accent: '#ffb642',
  accentDim: '#e59b2c',
  success: '#ffd18a',
  error: '#ffb642',
  warning: '#ffb642',
  info: '#d0a86c',
} as const;

// Ambient-effect colors (CRT scanline ink, vignette, pixel particles) that
// aren't UI colors. Components read them via theme.effects.*.
export const effects = {
  light: { ink: '#646464', vignette: '#505050', particle: '#b8b8b8', panel: '#dcdcdc', shadow: '#111111' },
  dark: { ink: paletteAmber.accent, vignette: '#505050', particle: paletteAmber.accent, panel: paletteAmber.raised, shadow: '#000000' },
} as const;

export const space = {
  none: '0',
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2.5rem',
  xxl: '4rem',
} as const;

export const fontSizes = {
  xs: '0.75rem',
  sm: '0.875rem',
  md: '1rem',
  lg: '1.25rem',
  xl: '1.5rem',
  '2xl': '2rem',
  '3xl': '3rem',
  '4xl': 'clamp(2.5rem, 8vw, 5rem)',
} as const;

export const fonts = {
  mono: "'dico-mono', 'Courier New', ui-monospace, monospace",
  display: "Arial, Helvetica, sans-serif",
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const radii = {
  none: '0',
  sm: '0',
  md: '0',
  lg: '0',
  pill: '999px',
} as const;

export const motion = {
  fast: '120ms',
  base: '160ms',
  slow: '240ms',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const breakpoints = {
  sm: '480px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 1000,
  toast: 1100,
} as const;
