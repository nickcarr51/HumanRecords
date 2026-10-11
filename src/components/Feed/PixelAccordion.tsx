'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styled from 'styled-components';

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

const Trails = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
  z-index: 1;
`;

type Pixel = { x: number; y: number; vx: number; vy: number; born: number; size: number };

export function PixelAccordion({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef(open);

  useEffect(() => {
    if (previous.current === open) return;
    previous.current = open;
    const element = panel.current;
    const layer = canvas.current;
    if (!element || !layer || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = layer.getContext('2d');
    if (!ctx) return;

    const width = element.clientWidth;
    const height = Math.max(element.scrollHeight, element.firstElementChild?.scrollHeight ?? 0) + 48;
    if (!width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = Math.ceil(width * ratio);
    layer.height = Math.ceil(height * ratio);
    layer.style.height = `${height}px`;
    ctx.scale(ratio, ratio);
    const pixels: Pixel[] = [];
    const start = performance.now();
    let last = start;
    let lastEmission = start;
    let frame = 0;

    const draw = (now: number) => {
      const elapsed = now - start;
      const delta = Math.min((now - last) / 1000, 0.04);
      last = now;
      ctx.clearRect(0, 0, width, height);
      if (elapsed < 420 && now - lastEmission > 24) {
        lastEmission = now;
        const edge = element.getBoundingClientRect().height;
        for (let i = 0; i < 5; i++) {
          pixels.push({
            x: Math.random() * width,
            y: edge,
            vx: (Math.random() - 0.5) * 36,
            vy: (open ? 1 : -1) * (18 + Math.random() * 42),
            born: now,
            size: Math.random() > 0.7 ? 4 : 2,
          });
        }
      }
      for (let i = pixels.length - 1; i >= 0; i--) {
        const p = pixels[i];
        const age = (now - p.born) / 360;
        if (age >= 1) { pixels.splice(i, 1); continue; }
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        ctx.globalAlpha = (1 - age) * 0.65;
        ctx.fillStyle = '#b8b8b8';
        ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      if (elapsed < 800) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
    };
  }, [open]);

  return (
    <Shell>
      <Panel ref={panel} id={id} $open={open} aria-hidden={!open} inert={!open}>
        <Clip>{children}</Clip>
      </Panel>
      <Trails ref={canvas} aria-hidden="true" />
    </Shell>
  );
}
