import { describe, expect, it } from 'vitest';
import { theme } from './theme';

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
});
