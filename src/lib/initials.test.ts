import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('takes the first letters of the first two words, uppercased', () => {
    expect(initials('night kalm')).toBe('NK');
    expect(initials('Odalys')).toBe('O');
  });

  it('ignores extra words and surrounding whitespace', () => {
    expect(initials('  the owl hours ')).toBe('TO');
  });
});
