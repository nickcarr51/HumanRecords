import { describe, expect, it } from 'vitest';
import { isRedirectError } from './redirect';

describe('isRedirectError', () => {
  it('is true for a NEXT_REDIRECT digest', () => {
    expect(isRedirectError(Object.assign(new Error('x'), { digest: 'NEXT_REDIRECT;/a' }))).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isRedirectError(new Error('x'))).toBe(false);
    expect(isRedirectError({ digest: 42 })).toBe(false);
    expect(isRedirectError({ digest: 'OTHER' })).toBe(false);
    expect(isRedirectError(null)).toBe(false);
    expect(isRedirectError(undefined)).toBe(false);
  });
});
