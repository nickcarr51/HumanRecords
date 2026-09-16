import { describe, expect, it } from 'vitest';
import { theme } from './theme';

describe('theme', () => {
  it('exposes the dark palette hero + surfaces', () => {
    expect(theme.colors.accent).toBe('#ffd000');
    expect(theme.colors.bg).toBe('#14141a');
    expect(theme.colors.error).toBe('#f85149');
  });

  it('exposes spacing, type, motion scales', () => {
    expect(theme.space.md).toBe('1rem');
    expect(theme.fontSizes.md).toBe('1rem');
    expect(theme.motion.base).toBe('160ms');
    expect(theme.fonts.mono).toContain('--font-mono');
  });
});
