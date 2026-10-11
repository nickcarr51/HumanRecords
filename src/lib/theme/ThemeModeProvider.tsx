'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createGlobalStyle, ThemeProvider } from 'styled-components';
import { theme, amberTheme } from './theme';

const STORAGE_KEY = 'humanrecords-amber-mode';
const CHANGE_EVENT = 'humanrecords-theme-change';
const ThemeMode = createContext({ dark: false, toggle: () => {} });
export const useThemeMode = () => useContext(ThemeMode);

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

let sessionDark = false;
function snapshot() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return sessionDark; }
}

const GlobalTheme = createGlobalStyle`
  html, body {
    background: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.text};
    color-scheme: ${({ theme }) => theme.mode};
  }
  body {
    text-shadow: ${({ theme }) => theme.mode === 'dark' ? '0 0 6px rgba(255,182,66,0.12)' : 'none'};
  }
  button, input, select, textarea, a {
    text-shadow: inherit;
  }
  button svg, a svg {
    overflow: visible;
    filter: drop-shadow(0 0 3px rgba(
      ${({ theme }) => theme.mode === 'dark' ? '255,182,66' : '255,107,27'},
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

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const dark = useSyncExternalStore(subscribe, snapshot, () => false);
  function toggle() {
    const nextDark = !dark;
    const update = () => {
      sessionDark = nextDark;
      try { localStorage.setItem(STORAGE_KEY, String(sessionDark)); } catch {}
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
