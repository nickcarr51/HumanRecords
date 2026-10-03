import { describe, expect, it } from 'vitest';
import { theme } from './theme';

describe('theme', () => {
  it('exposes the dark palette hero + surfaces', () => {
    expect(theme.colors.accent).toBe('#eb4601');
    expect(theme.colors.bg).toBe('#282723');
    expect(theme.colors.error).toBe('#f85149');
  });

  it('exposes spacing, type, motion scales', () => {
    expect(theme.space.md).toBe('1rem');
    expect(theme.fontSizes.md).toBe('1rem');
    expect(theme.motion.base).toBe('160ms');
    expect(theme.fonts.mono).toContain('dico-mono');
    expect(theme.fonts.display).toContain('dico-mono');
  });
});
