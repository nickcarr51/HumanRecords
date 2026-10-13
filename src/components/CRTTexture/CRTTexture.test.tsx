import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CRTTexture } from './CRTTexture';

type FakeAnimation = { cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null };

let reducedMatches = false;
let animations: FakeAnimation[] = [];
let animate: ReturnType<typeof vi.fn>;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  reducedMatches = false;
  animations = [];
  setHidden(false);
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reducedMatches; },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  animate = vi.fn(() => {
    const animation: FakeAnimation = { cancel: vi.fn(), onfinish: null };
    animations.push(animation);
    return animation;
  });
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setHidden(false);
});

it('sweeps a band across the viewport on the compositor, then waits for the next one', () => {
  renderWithTheme(<CRTTexture />);
  const band = screen.getByTestId('crt-band');
  expect(screen.getByTestId('crt-scanlines').dataset.paused).toBe('false');
  expect(animate).not.toHaveBeenCalled();

  act(() => { vi.advanceTimersByTime(5000); });
  expect(animate).toHaveBeenCalledOnce();
  expect(band.style.visibility).toBe('visible');
  const [frames, options] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
  expect(String(frames[0].transform)).toMatch(/translateY\(-?\d/);
  expect(String(frames[2].transform)).toMatch(/translateY\(-?\d/);
  expect(options.duration).toBeGreaterThanOrEqual(5500);

  act(() => { animations[0].onfinish?.(); });
  expect(band.style.visibility).toBe('hidden');
  act(() => { vi.advanceTimersByTime(11000); });
  expect(animate).toHaveBeenCalledTimes(2);
});

it('never sweeps under reduced motion', () => {
  reducedMatches = true;
  renderWithTheme(<CRTTexture />);
  act(() => { vi.advanceTimersByTime(20000); });
  expect(animate).not.toHaveBeenCalled();
});

it('runs nothing while the page is hidden and restarts on return', () => {
  setHidden(true);
  renderWithTheme(<CRTTexture />);
  expect(screen.getByTestId('crt-scanlines').dataset.paused).toBe('true');
  act(() => { vi.advanceTimersByTime(20000); });
  expect(animate).not.toHaveBeenCalled();

  setHidden(false);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(screen.getByTestId('crt-scanlines').dataset.paused).toBe('false');
  act(() => { vi.advanceTimersByTime(5000); });
  expect(animate).toHaveBeenCalledOnce();

  // Hiding mid-sweep cancels it and hides the band.
  setHidden(true);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(animations[0].cancel).toHaveBeenCalled();
  expect(screen.getByTestId('crt-band').style.visibility).toBe('hidden');
});

it('cancels the timer and any running sweep on unmount', () => {
  const view = renderWithTheme(<CRTTexture />);
  act(() => { vi.advanceTimersByTime(5000); });
  expect(animate).toHaveBeenCalledOnce();
  view.unmount();
  expect(animations[0].cancel).toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(30000); });
  expect(animate).toHaveBeenCalledOnce();
});
