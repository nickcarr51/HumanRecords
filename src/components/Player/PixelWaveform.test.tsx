import { afterEach, expect, it, vi } from 'vitest';
import { renderWithTheme } from '@/test/renderWithTheme';
import { AudioWaveformContext } from './audioMeter';
import { PixelWaveform } from './PixelWaveform';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('draws taller pixel columns from the audio signal and stops sampling when paused', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const fillRect = vi.fn();
  const ctx = { scale: vi.fn(), clearRect: vi.fn(), fillRect, fillStyle: '', globalAlpha: 1 };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  const sample = vi.fn(() => new Uint8Array(256).fill(255));
  const ui = (playing: boolean) => <AudioWaveformContext.Provider value={sample}><PixelWaveform playing={playing} status="ready" /></AudioWaveformContext.Provider>;
  const view = renderWithTheme(ui(true));
  expect(sample).toHaveBeenCalledOnce();
  expect(fillRect.mock.calls.length).toBeGreaterThan(32);
  fillRect.mockClear();
  sample.mockClear();
  view.rerender(ui(false));
  expect(sample).not.toHaveBeenCalled();
  expect(fillRect).toHaveBeenCalledTimes(32);
});
