import { describe, expect, it } from 'vitest';
import { theme, amberTheme } from './theme';

describe('theme', () => {
  it('exposes the gray, monochrome, and orange palette', () => {
    expect(theme.colors.accent).toBe('#ff6b1b');
    expect(theme.colors.bg).toBe('#e8e8e8');
    expect(theme.colors.error).toBe('#a33800');
  });

  it('exposes spacing, type, motion scales', () => {
    expect(theme.space.md).toBe('1rem');
    expect(theme.fontSizes.md).toBe('1rem');
    expect(theme.motion.base).toBe('160ms');
    expect(theme.fonts.mono).toContain('dico-mono');
    expect(theme.fonts.display).toContain('Arial');
  });

  it('amber theme shares scales and swaps colors and effect inks', () => {
    expect(amberTheme.mode).toBe('dark');
    expect(amberTheme.colors.accent).toBe('#ffb642');
    expect(amberTheme.colors.bg).toBe('#15110b');
    expect(amberTheme.effects.ink).toBe(amberTheme.colors.accent);
    expect(theme.effects.ink).toBe('#646464');
    expect(theme.effects.panel).toBe('#dcdcdc');
    expect(amberTheme.effects.panel).toBe(amberTheme.colors.raised);
    expect(amberTheme.space).toBe(theme.space);
  });
});
