'use client';

import { useEffect, useRef } from 'react';
import styled from 'styled-components';

const Layer = styled.canvas`
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: ${({ theme }) => theme.zIndex.toast + 1};
`;

/** A texture overlay: warps the scanlines while keeping text and controls crisp. */
export function CRTTexture() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const layer = canvas.current;
    if (!layer || !window.matchMedia) return;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = -Infinity;
    let vignette: CanvasGradient;
    type Sweep = { start: number; duration: number; origin: number; travel: number; thickness: number; strength: number; offset: number };
    let sweep: Sweep | null = null;
    let nextSweep = performance.now() + 2000 + Math.random() * 3000;

    const paint = (now: number) => {
      const time = reduced.matches ? 0 : now / 1000;
      ctx.clearRect(0, 0, width, height);
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.8);
      ctx.fillStyle = `rgba(80, 80, 80, ${0.014 + pulse * 0.012})`;
      ctx.fillRect(0, 0, width, height);

      // Sparse, bent scanlines suggest analog drift without flashing or RGB noise.
      ctx.strokeStyle = `rgba(90, 90, 90, ${0.024 + pulse * 0.01})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 0; y < height; y += 4) {
        ctx.moveTo(0, y);
        for (let x = 0; x <= width + 32; x += 32) {
          const bend = Math.sin(x / 180 + time * 0.35 + y / 240) * 0.7;
          ctx.lineTo(x, y + bend);
        }
      }
      ctx.stroke();

      const bandY = reduced.matches ? height / 2 : ((time * 12) % (height + 180)) - 90;
      const band = ctx.createLinearGradient(0, bandY - 70, 0, bandY + 70);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, 'rgba(255,255,255,0.035)');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = band;
      ctx.fillRect(0, bandY - 70, width, 140);

      // Intermittent tracking passes: vary their timing, position and direction.
      if (!reduced.matches && now >= nextSweep) {
        sweep = {
          start: now,
          duration: 900 + Math.random() * 1300,
          origin: Math.random() * height,
          travel: (Math.random() > 0.3 ? 1 : -1) * height * (0.15 + Math.random() * 0.3),
          thickness: 8 + Math.random() * 20,
          strength: 0.04 + Math.random() * 0.035,
          offset: Math.random() * 100,
        };
        nextSweep = now + sweep.duration + 4000 + Math.random() * 7000;
      }
      if (sweep && !reduced.matches) {
        const progress = (now - sweep.start) / sweep.duration;
        if (progress >= 1) sweep = null;
        else {
          const envelope = Math.sin(Math.PI * progress);
          const y = sweep.origin + progress * sweep.travel;
          const tracking = ctx.createLinearGradient(0, y - sweep.thickness, 0, y + sweep.thickness);
          tracking.addColorStop(0, 'rgba(100,100,100,0)');
          tracking.addColorStop(0.5, `rgba(100,100,100,${sweep.strength * envelope})`);
          tracking.addColorStop(1, 'rgba(100,100,100,0)');
          ctx.fillStyle = tracking;
          ctx.fillRect(0, y - sweep.thickness, width, sweep.thickness * 2);
          ctx.strokeStyle = `rgba(100,100,100,${envelope * 0.1})`;
          ctx.beginPath();
          for (let line = 0; line < 3; line++) {
            const lineY = y + line * 3;
            ctx.moveTo(0, lineY);
            for (let x = 0; x <= width + 24; x += 24) {
              const wobble = Math.sin(x / 80 + time * 2 + sweep.offset + line) * envelope * 1.5;
              ctx.lineTo(x, lineY + wobble);
            }
          }
          ctx.stroke();
          // A short broken gray line lends a little old-display tracking noise.
          ctx.fillStyle = `rgba(110,110,110,${envelope * 0.09})`;
          for (let x = 0; x < width; x += 48) {
            if (Math.sin(x * 0.7 + sweep.offset) > 0) ctx.fillRect(x, Math.round(y + 12), 12, 1);
          }
        }
      }
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const tick = (now: number) => {
      // Texture needs only 24 fps; avoid a full-screen redraw every display frame.
      if (now - last >= 1000 / 24) { paint(now); last = now; }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      if (document.hidden) return;
      last = -Infinity;
      sweep = null;
      nextSweep = performance.now() + 2000 + Math.random() * 3000;
      paint(performance.now());
      if (!reduced.matches) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      layer.width = Math.ceil(width * ratio);
      layer.height = Math.ceil(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const radius = Math.hypot(width, height) / 2;
      vignette = ctx.createRadialGradient(width / 2, height / 2, radius * 0.35, width / 2, height / 2, radius);
      vignette.addColorStop(0, 'rgba(80,80,80,0)');
      vignette.addColorStop(1, 'rgba(80,80,80,0.055)');
      resume();
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener('change', resume);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', resume);
      reduced.removeEventListener('change', resume);
    };
  }, []);

  return <Layer ref={canvas} aria-hidden="true" />;
}
