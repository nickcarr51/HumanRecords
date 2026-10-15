import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useTheme } from 'styled-components';
import { ThemeModeProvider, useThemeMode } from './ThemeModeProvider';
import { THEME_COOKIE } from './mode-cookie';

const cookieValue = () => document.cookie.split('; ').find((c) => c.startsWith(`${THEME_COOKIE}=`))?.split('=')[1] ?? null;
const setCookie = (value: 'night' | 'day') => { document.cookie = `${THEME_COOKIE}=${value}; path=/`; };

const route = vi.hoisted(() => ({ pathname: '/feed' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

const originalTransition = document.startViewTransition;
afterEach(() => {
  route.pathname = '/feed';
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
  if (originalTransition) document.startViewTransition = originalTransition;
  else Reflect.deleteProperty(document, 'startViewTransition');
  vi.unstubAllGlobals();
});

function Toggle() {
  const { dark, toggle } = useThemeMode();
  const theme = useTheme();
  return <button aria-pressed={dark} onClick={toggle}>{theme.mode}</button>;
}

describe('ThemeModeProvider', () => {
  it.each(['/', '/login', '/login/error'])('renders %s in amber even with a saved day preference', (pathname) => {
    route.pathname = pathname;
    setCookie('day');
    const view = render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument();
    expect(cookieValue()).toBe('day');
    route.pathname = '/feed';
    view.rerender(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    expect(screen.getByRole('button', { name: 'light' })).toBeInTheDocument();
  });
  it('defaults to amber with no saved preference', () => {
    render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    expect(screen.getByRole('button', { name: 'dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(cookieValue()).toBeNull();
  });

  it('switches the theme and persists the choice, then restores amber mode', () => {
    render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(screen.getByRole('button', { name: 'light' })).toHaveAttribute('aria-pressed', 'false');
    expect(cookieValue()).toBe('day');
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(screen.getByRole('button', { name: 'dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(cookieValue()).toBe('night');
  });

  it('restores a saved amber preference', () => {
    setCookie('night');
    render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    expect(screen.getByRole('button', { name: 'dark' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('server-renders the cookie-seeded mode so night users get no gray flash', () => {
    expect(renderToString(<ThemeModeProvider><Toggle /></ThemeModeProvider>)).toContain('>dark<');
    expect(renderToString(<ThemeModeProvider initialDark={false}><Toggle /></ThemeModeProvider>)).toContain('>light<');
  });

  it('updates the theme within a viewport transition when available', () => {
    const transition = vi.fn((update: () => void) => {
      update();
      return { ready: Promise.resolve() };
    });
    Object.defineProperty(document, 'startViewTransition', { configurable: true, writable: true, value: transition });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    setCookie('day');
    render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(transition).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.themeReveal).toBe('night');
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument();
  });
});
