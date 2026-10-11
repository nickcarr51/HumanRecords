import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useTheme } from 'styled-components';
import { ThemeModeProvider, useThemeMode } from './ThemeModeProvider';

const route = vi.hoisted(() => ({ pathname: '/feed' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

const originalTransition = document.startViewTransition;
afterEach(() => {
  route.pathname = '/feed';
  localStorage.clear();
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
    localStorage.setItem('humanrecords-amber-mode', 'false');
    const view = render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument();
    expect(localStorage.getItem('humanrecords-amber-mode')).toBe('false');
    route.pathname = '/feed';
    view.rerender(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    expect(screen.getByRole('button', { name: 'light' })).toBeInTheDocument();
  });
  it('switches the theme and persists the choice, then restores gray mode', () => {
    render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(screen.getByRole('button', { name: 'dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('humanrecords-amber-mode')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(screen.getByRole('button', { name: 'light' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('humanrecords-amber-mode')).toBe('false');
  });

  it('restores a saved amber preference', () => {
    localStorage.setItem('humanrecords-amber-mode', 'true');
    render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    expect(screen.getByRole('button', { name: 'dark' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('updates the theme within a viewport transition when available', () => {
    const transition = vi.fn((update: () => void) => {
      update();
      return { ready: Promise.resolve() };
    });
    Object.defineProperty(document, 'startViewTransition', { configurable: true, writable: true, value: transition });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    render(<ThemeModeProvider><Toggle /></ThemeModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(transition).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.themeReveal).toBe('night');
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument();
  });
});
