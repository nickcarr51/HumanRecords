'use client';

import { useEffect, useId, useRef } from 'react';
import styled, { useTheme } from 'styled-components';

const Layer = styled.canvas`
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: ${({ theme }) => theme.zIndex.toast + 1};
`;

const DistortionBand = styled.div`
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  pointer-events: none;
  visibility: hidden;
  z-index: ${({ theme }) => theme.zIndex.toast + 1};
  mask-image: linear-gradient(to bottom, transparent, black 35%, black 65%, transparent);
`;

/** Canvas tracking texture and a narrow backdrop filter move together. */
export function CRTTexture() {
  const dark = useTheme().mode === 'dark';
  const canvas = useRef<HTMLCanvasElement>(null);
  const distortion = useRef<HTMLDivElement>(null);
  const displacement = useRef<SVGFEDisplacementMapElement>(null);
  const filterId = `crt-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const layer = canvas.current;
    const bandElement = distortion.current;
    if (!layer || !window.matchMedia) return;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ink = dark ? '255, 182, 66' : '100, 100, 100';
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
      if (bandElement) bandElement.style.visibility = 'hidden';
      ctx.clearRect(0, 0, width, height);
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.8);
      ctx.fillStyle = `rgba(${ink}, ${0.014 + pulse * 0.012})`;
      ctx.fillRect(0, 0, width, height);

      // Sparse, bent scanlines suggest analog drift without flashing or RGB noise.
      ctx.strokeStyle = `rgba(${ink}, ${(dark ? 0.055 : 0.024) + pulse * 0.01})`;
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

      // Each tracking pass starts off-screen and crosses the entire viewport.
      if (!reduced.matches && now >= nextSweep) {
        const downward = Math.random() > 0.5;
        const margin = 80;
        sweep = {
          start: now,
          duration: 5500 + Math.random() * 2500,
          origin: downward ? -margin : height + margin,
          travel: (downward ? 1 : -1) * (height + margin * 2),
          thickness: 8 + Math.random() * 20,
          strength: 0.02 + Math.random() * 0.015,
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
          if (bandElement) {
            bandElement.style.visibility = 'visible';
            bandElement.style.transform = `translateY(${y - sweep.thickness * 2}px)`;
            bandElement.style.height = `${sweep.thickness * 4}px`;
          }
          displacement.current?.setAttribute('scale', String(envelope * 1.2));
          const tracking = ctx.createLinearGradient(0, y - sweep.thickness, 0, y + sweep.thickness);
          tracking.addColorStop(0, `rgba(${ink},0)`);
          tracking.addColorStop(0.5, `rgba(${ink},${sweep.strength * envelope})`);
          tracking.addColorStop(1, `rgba(${ink},0)`);
          ctx.fillStyle = tracking;
          ctx.fillRect(0, y - sweep.thickness, width, sweep.thickness * 2);
          ctx.strokeStyle = `rgba(${ink},${envelope * 0.045})`;
          ctx.beginPath();
          for (let line = 0; line < 3; line++) {
            const lineY = y + line * 3;
            ctx.moveTo(0, lineY);
            for (let x = 0; x <= width + 24; x += 24) {
              const wobble = Math.sin(x / 120 + time * 0.8 + sweep.offset + line) * envelope * 0.6;
              ctx.lineTo(x, lineY + wobble);
            }
          }
          ctx.stroke();
          // A short broken gray line lends a little old-display tracking noise.
          ctx.fillStyle = `rgba(${ink},${envelope * 0.035})`;
          for (let x = 0; x < width; x += 48) {
            if (Math.sin(x * 0.7 + sweep.offset) > 0) ctx.fillRect(x, Math.round(y + 12), 12, 1);
          }
        }
      }
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const tick = (now: number) => {
      // Keep the moving band smooth at 60 fps on faster displays too.
      if (now - last >= 1000 / 60 - 1) { paint(now); last = now; }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      if (bandElement) bandElement.style.visibility = 'hidden';
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
      if (bandElement) bandElement.style.visibility = 'hidden';
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', resume);
      reduced.removeEventListener('change', resume);
    };
  }, [dark]);

  const filter = `url("#${filterId}") blur(0.1px)`;
  return (
    <>
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <filter id={filterId} x="-5%" y="-20%" width="110%" height="140%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.08" numOctaves="1" seed="9" result="tracking" />
            <feDisplacementMap ref={displacement} in="SourceGraphic" in2="tracking" scale="0" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <DistortionBand ref={distortion} aria-hidden="true" style={{ backdropFilter: filter, WebkitBackdropFilter: filter }} />
      <Layer ref={canvas} aria-hidden="true" />
    </>
  );
}
