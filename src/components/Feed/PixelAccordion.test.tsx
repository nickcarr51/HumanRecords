import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '@/test/renderWithTheme';
import { PixelAccordion } from './PixelAccordion';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PixelAccordion particles', () => {
  it('emits pixels even when the first frame is delayed and removes its canvas on unmount', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    let draw: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      draw = callback;
      return 1;
    });
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const fillRect = vi.fn();
    const context = { scale: vi.fn(), clearRect: vi.fn(), fillRect, globalAlpha: 1, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const view = renderWithTheme(<PixelAccordion id="tracks" open={false}>Tracks</PixelAccordion>);
    view.rerender(<PixelAccordion id="tracks" open>Tracks</PixelAccordion>);
    const canvas = document.body.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    draw!(performance.now() + 2000);
    expect(fillRect).toHaveBeenCalledTimes(4);
    expect(context.globalAlpha).toBe(1);
    view.unmount();
    expect(canvas).not.toBeInTheDocument();
    expect(cancel).toHaveBeenCalled();
  });

  it('does not create a particle canvas when reduced motion is enabled', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const view = renderWithTheme(<PixelAccordion id="tracks" open={false}>Tracks</PixelAccordion>);
    view.rerender(<PixelAccordion id="tracks" open>Tracks</PixelAccordion>);
    expect(document.body.querySelector('canvas')).toBeNull();
  });
});
