export const palette = {
  bgBase: '#14141a',
  surface: '#1c1c24',
  raised: '#24242e',
  text: '#f5f0e6',
  muted: '#a3a3a3',
  faint: '#6b6b73',
  border: '#2e2e38',
  accent: '#ffd000',
  accentDim: '#b39400',
  success: '#3fb950',
  error: '#f85149',
  warning: '#d29922',
  info: '#58a6ff',
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
  mono: "var(--font-mono), 'Courier New', ui-monospace, monospace",
  display: 'var(--font-display), system-ui, -apple-system, sans-serif',
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const radii = {
  none: '0',
  sm: '2px',
  md: '4px',
  lg: '8px',
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
