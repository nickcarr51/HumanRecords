'use client';

import { useEffect, useRef } from 'react';
import styled, { useTheme } from 'styled-components';
import { useAudioWaveform } from './audioMeter';

const Signal = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.colors.accent};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  canvas { width: 96px; height: 24px; }
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    canvas { width: 72px; }
  }
`;

export function PixelWaveform({ playing, status }: { playing: boolean; status: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const readWaveform = useAudioWaveform();
  const theme = useTheme();
  const label = status === 'error' ? 'Error' : status === 'loading' ? 'Loading' : playing ? 'Playing' : 'Paused';
  useEffect(() => {
    const layer = canvas.current;
    if (!layer) return;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = 96 * ratio;
    layer.height = 24 * ratio;
    ctx.scale(ratio, ratio);
    let frame = 0;
    let last = -Infinity;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    function draw(now: number) {
      if (!ctx) return;
      if (now - last >= 1000 / 30) {
        last = now;
        ctx.clearRect(0, 0, 96, 24);
        const samples = playing && !document.hidden ? readWaveform?.() : null;
        ctx.fillStyle = playing ? theme.colors.accent : theme.colors.faint;
        ctx.globalAlpha = samples ? 0.85 : 0.35;
        for (let x = 0; x < 32; x++) {
          let peak = 0;
          if (samples) {
            const start = Math.floor(x * samples.length / 32);
            const end = Math.floor((x + 1) * samples.length / 32);
            for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i] - 128) / 128);
          }
          const extent = Math.min(10, Math.round(peak * 16 / 3) * 3);
          for (let y = 11 - extent; y <= 11 + extent; y += 3) ctx.fillRect(x * 3, y, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      if (playing && !reduced) frame = requestAnimationFrame(draw);
    }
    draw(performance.now());
    return () => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, 96, 24); };
  }, [playing, readWaveform, theme.colors.accent, theme.colors.faint]);
  return <Signal><span>{label}</span><canvas ref={canvas} aria-hidden="true" /></Signal>;
}
