'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';

const Shell = styled.div`
  position: relative;
`;

const Panel = styled.div<{ $open: boolean }>`
  display: grid;
  grid-template-rows: ${({ $open }) => $open ? '1fr' : '0fr'};
  opacity: ${({ $open }) => $open ? 1 : 0};
  transition: grid-template-rows 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease;
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Clip = styled.div`
  min-height: 0;
  overflow: hidden;
`;

type Pixel = { x: number; y: number; vx: number; vy: number; gravity: number; born: number; life: number; size: number };

export function PixelAccordion({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const previous = useRef(open);
  const particleColor = useTheme().mode === 'dark' ? '#ffb642' : '#b8b8b8';

  useEffect(() => {
    if (previous.current === open) return;
    previous.current = open;
    const element = panel.current;
    if (!element || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('canvas');
    layer.setAttribute('aria-hidden', 'true');
    // A body-level viewport canvas escapes the feed's scrolling/clipping region.
    Object.assign(layer.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '200' });
    const ctx = layer.getContext('2d');
    if (!ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = Math.ceil(width * ratio);
    layer.height = Math.ceil(height * ratio);
    ctx.scale(ratio, ratio);
    document.body.appendChild(layer);
    const pixels: Pixel[] = [];
    // Start on the first rendered frame so a busy main thread cannot skip emission.
    let start: number | null = null;
    let last = 0;
    let lastEmission = -Infinity;
    let frame = 0;

    const draw = (now: number) => {
      if (start === null) { start = now; last = now; }
      const elapsed = now - start;
      const delta = Math.min((now - last) / 1000, 0.04);
      last = now;
      ctx.clearRect(0, 0, width, height);
      if (elapsed < 420 && now - lastEmission > 40) {
        lastEmission = now;
        const bounds = element.getBoundingClientRect();
        const edge = Math.max(0, Math.min(bounds.bottom, height - 48));
        for (let i = 0; i < 4; i++) {
          const life = open ? 2200 + Math.random() * 1200 : 1300 + Math.random() * 500;
          const spread = Math.random() * 2 - 1;
          pixels.push({
            x: bounds.left + (spread + 1) / 2 * bounds.width,
            y: edge,
            vx: open ? spread * 6 : Math.sign(spread) * (25 + Math.random() * 55),
            vy: open ? (height - edge + 16) / (life / 1000) : -(60 + Math.random() * 45),
            gravity: open ? 0 : 400 + Math.random() * 120,
            born: now,
            life,
            size: Math.random() > 0.55 ? 3 : 2,
          });
        }
      }
      for (let i = pixels.length - 1; i >= 0; i--) {
        const p = pixels[i];
        const age = (now - p.born) / p.life;
        if (age >= 1) { pixels.splice(i, 1); continue; }
        p.x += p.vx * delta;
        p.vy += p.gravity * delta;
        p.y += p.vy * delta;
        ctx.globalAlpha = Math.pow(1 - age, 1.2) * 0.7;
        ctx.fillStyle = particleColor;
        ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      if (elapsed < 420 || pixels.length) frame = requestAnimationFrame(draw);
      else layer.remove();
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
      layer.remove();
    };
  }, [open, particleColor]);

  return (
    <Shell>
      <Panel ref={panel} id={id} $open={open} aria-hidden={!open} inert={!open}>
        <Clip>{children}</Clip>
      </Panel>
    </Shell>
  );
}
