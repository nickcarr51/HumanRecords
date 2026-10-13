import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbTriplet, withAlpha } from './color';

describe('color helpers', () => {
  it('parses 6- and 3-digit hex', () => {
    expect(hexToRgb('#ff6b1b')).toEqual([255, 107, 27]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('orange')).toBeNull();
  });
  it('builds rgba strings and clamps alpha', () => {
    expect(withAlpha('#ffb642', 0.12)).toBe('rgba(255, 182, 66, 0.12)');
    expect(withAlpha('#111111', 2)).toBe('rgba(17, 17, 17, 1)');
    expect(withAlpha('currentColor', 0.5)).toBe('currentColor');
  });
  it('emits a bare triplet for canvas use', () => {
    expect(rgbTriplet('#646464')).toBe('100, 100, 100');
  });
});
