import { describe, expect, it } from 'vitest';
import { THEME_COOKIE, isDarkCookieValue, readThemeCookie, themeCookieString } from './mode-cookie';

describe('theme mode cookie', () => {
  it('only "night" means dark', () => {
    expect(isDarkCookieValue('night')).toBe(true);
    expect(isDarkCookieValue('day')).toBe(false);
    expect(isDarkCookieValue(undefined)).toBe(false);
  });
  it('reads its own cookie out of a cookie string, null when absent', () => {
    expect(readThemeCookie(`a=1; ${THEME_COOKIE}=night; b=2`)).toBe(true);
    expect(readThemeCookie(`${THEME_COOKIE}=day`)).toBe(false);
    expect(readThemeCookie('a=1')).toBeNull();
  });
  it('writes a year-long, site-wide, lax cookie', () => {
    expect(themeCookieString(true)).toBe(`${THEME_COOKIE}=night; path=/; max-age=31536000; samesite=lax`);
    expect(themeCookieString(false)).toContain(`${THEME_COOKIE}=day`);
  });
});
