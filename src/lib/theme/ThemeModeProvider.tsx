'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createGlobalStyle, ThemeProvider } from 'styled-components';
import { theme, amberTheme } from './theme';
import { rgbTriplet, withAlpha } from './color';
import { usePathname } from 'next/navigation';
import { readThemeCookie, themeCookieString } from './mode-cookie';

const CHANGE_EVENT = 'humanrecords-theme-change';
const ThemeMode = createContext({ dark: false, toggle: () => {} });
export const useThemeMode = () => useContext(ThemeMode);

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

// In-memory fallback when cookies are blocked; the cookie is the source of truth.
let sessionDark = true;
function snapshot() {
  try { return readThemeCookie(document.cookie) ?? sessionDark; }
  catch { return sessionDark; }
}

const GlobalTheme = createGlobalStyle`
  html, body {
    background: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.text};
    color-scheme: ${({ theme }) => theme.mode};
    accent-color: ${({ theme }) => theme.colors.accent};
    -webkit-tap-highlight-color: ${({ theme }) => withAlpha(theme.colors.accent, 0.15)};
  }
  :where(a, button, input, select, textarea, [tabindex]):focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: 2px;
  }
  input, textarea {
    caret-color: ${({ theme }) => theme.colors.accent};
  }
  body {
    text-shadow: ${({ theme }) => theme.mode === 'dark' ? `0 0 6px ${withAlpha(theme.colors.accent, 0.12)}` : 'none'};
  }
  button, input, select, textarea, a {
    text-shadow: inherit;
  }
  button svg, a svg {
    overflow: visible;
    filter: drop-shadow(0 0 3px rgba(
      ${({ theme }) => rgbTriplet(theme.colors.accent)},
      calc(${({ theme }) => theme.mode === 'dark' ? '0.08' : '0'} + var(--hover-progress, 0) * 0.14)
    ));
  }
  ::selection {
    background: ${({ theme }) => theme.colors.accent};
    color: ${({ theme }) => theme.colors.bg};
  }
  /* Reveal the actual themed page, including its text, icons and CRT canvas. */
  ::view-transition-group(root) { animation-duration: 1300ms; }
  ::view-transition-old(root), ::view-transition-new(root) {
    animation: none;
    mix-blend-mode: normal;
  }
  ::view-transition-old(root) { z-index: 1; }
  ::view-transition-new(root) { z-index: 2; }
  html[data-theme-reveal='night']::view-transition-new(root) {
    animation: night-roll 1300ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  html[data-theme-reveal='day']::view-transition-new(root) {
    animation: day-roll 1100ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes night-roll {
    from { clip-path: inset(0 0 100% 0); }
    to { clip-path: inset(0 0 0 0); }
  }
  @keyframes day-roll {
    from { clip-path: inset(100% 0 0 0); }
    to { clip-path: inset(0 0 0 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    ::view-transition-group(root), ::view-transition-new(root) { animation: none !important; }
  }
`;

/**
 * `initialDark` is the cookie value as read by the server (root layout), so the
 * server-rendered HTML and the first client render agree: no theme flash.
 */
export function ThemeModeProvider({ children, initialDark = true }: { children: ReactNode; initialDark?: boolean }) {
  const pathname = usePathname();
  const savedDark = useSyncExternalStore(subscribe, snapshot, () => initialDark);
  const entrance = pathname === '/' || pathname === '/login' || pathname?.startsWith('/login/');
  const dark = Boolean(entrance) || savedDark;
  function toggle() {
    const nextDark = !dark;
    const update = () => {
      sessionDark = nextDark;
      try { document.cookie = themeCookieString(nextDark); } catch {}
      window.dispatchEvent(new Event(CHANGE_EVENT));
    };
    if (!document.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      update();
      return;
    }
    document.documentElement.dataset.themeReveal = nextDark ? 'night' : 'day';
    const transition = document.startViewTransition(() => flushSync(update));
    // A skipped capture still runs the update; suppress only the animation rejection.
    void transition.ready.catch(() => {});
  }
  return (
    <ThemeMode.Provider value={{ dark, toggle }}>
      <ThemeProvider theme={dark ? amberTheme : theme}>
        <GlobalTheme />
        {children}
      </ThemeProvider>
    </ThemeMode.Provider>
  );
}
