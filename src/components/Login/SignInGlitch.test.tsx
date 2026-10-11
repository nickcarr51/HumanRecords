import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignInGlitch } from './SignInGlitch';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('spaces out glitches while keeping the focused input intact', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const view = render(<SignInGlitch><input aria-label="Email" defaultValue="listener@example.com" /></SignInGlitch>);
  const input = screen.getByLabelText('Email');
  input.focus();
  const layer = input.parentElement!;
  vi.advanceTimersByTime(9999);
  expect(layer.style.filter).toBe('');
  vi.advanceTimersByTime(1);
  expect(layer.style.filter).toContain('signin-glitch');
  expect(input).toHaveFocus();
  expect(input).toHaveValue('listener@example.com');
  vi.advanceTimersByTime(500);
  expect(layer.style.filter).toBe('');
  expect(layer.style.transform).toBe('');
  vi.advanceTimersByTime(26250);
  expect(layer.style.filter).toContain('signin-glitch');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not schedule glitches for reduced motion', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  render(<SignInGlitch>Sign in</SignInGlitch>);
  expect(vi.getTimerCount()).toBe(0);
});
