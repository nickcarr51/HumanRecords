// Night-mode preference travels as a cookie so the server renders the right
// theme on first paint (localStorage would mean a gray flash for night users).
export const THEME_COOKIE = 'hs-theme';
export type ThemeCookieValue = 'night' | 'day';

export function isDarkCookieValue(value: string | undefined | null): boolean {
  return value === 'night';
}

/** Reads the preference from a document.cookie string; null when unset. */
export function readThemeCookie(cookieString: string): boolean | null {
  const match = cookieString.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${THEME_COOKIE}=`));
  if (!match) return null;
  return isDarkCookieValue(decodeURIComponent(match.slice(THEME_COOKIE.length + 1)));
}

export function themeCookieString(dark: boolean): string {
  const value: ThemeCookieValue = dark ? 'night' : 'day';
  return `${THEME_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}
