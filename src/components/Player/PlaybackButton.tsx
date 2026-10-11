'use client';

import { useEffect, useRef, type ButtonHTMLAttributes } from 'react';
import styled, { useTheme } from 'styled-components';
import { PlayButton } from '@/components/Feed/feed.styles';
import { withAlpha } from '@/lib/theme/color';
import { useAudioMeter } from './audioMeter';

const Shell = styled.span<{ $active: boolean }>`
  position: relative;
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  isolation: isolate;
  &::before {
    content: '';
    position: absolute;
    inset: -18px;
    border-radius: 50%;
    pointer-events: none;
    z-index: -1;
    background: radial-gradient(circle,
      ${({ theme }) => withAlpha(theme.colors.accent, 0.13)} 0%,
      ${({ theme }) => withAlpha(theme.colors.accent, 0.08)} 28%,
      ${({ theme }) => withAlpha(theme.colors.accent, 0.024)} 48%,
      ${({ theme }) => withAlpha(theme.colors.accent, 0)} 72%);
    opacity: ${({ $active }) => $active ? 1 : 0};
    transition: opacity 320ms ease;
  }
`;
const ActiveButton = styled(PlayButton)<{ $active: boolean }>`
  ${({ $active, theme }) => $active && `
    color: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
    box-shadow: inset 0 0 6px ${withAlpha(theme.colors.accent, 0.086)};
    svg { filter: drop-shadow(0 0 3px ${withAlpha(theme.colors.accent, 0.4)}); }
  `}
`;
const Particles = styled.canvas`
  position: absolute;
  width: 130px;
  height: 130px;
  top: -47px;
  left: -47px;
  pointer-events: none;
  border-radius: 50%;
  mask-image: radial-gradient(circle, black 35%, rgba(0,0,0,0.75) 55%, transparent 72%);
  -webkit-mask-image: radial-gradient(circle, black 35%, rgba(0,0,0,0.75) 55%, transparent 72%);
`;

export function PlaybackButton({ active, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const readLevel = useAudioMeter();
  const particleColor = useTheme().colors.accent;
  useEffect(() => {
    const layer = canvas.current;
    if (!active || !readLevel || !layer || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = layer.height = 130 * ratio;
    ctx.scale(ratio, ratio);
    const pixels: { x: number; y: number; vx: number; vy: number; life: number; age: number }[] = [];
    let last = performance.now();
    let emission = 0;
    let frame = 0;
    function draw(now: number) {
      if (!ctx) return;
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, 130, 130);
      const energy = document.hidden ? 0 : readLevel!();
      if (energy > 0.03) emission += delta * energy * 20;
      while (emission >= 1 && pixels.length < 35) {
        emission -= 1;
        const angle = Math.random() * Math.PI * 2;
        const speed = 12 + energy * 32;
        pixels.push({ x: 65 + Math.cos(angle) * 19, y: 65 + Math.sin(angle) * 19, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 7, age: 0, life: 0.5 + Math.random() * 0.5 });
      }
      for (let i = pixels.length - 1; i >= 0; i--) {
        const p = pixels[i];
        p.age += delta;
        if (p.age >= p.life) { pixels.splice(i, 1); continue; }
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        ctx.globalAlpha = (1 - p.age / p.life) * 0.5;
        ctx.fillStyle = particleColor;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, 130, 130); };
  }, [active, readLevel, particleColor]);
  return (
    <Shell $active={active}>
      <ActiveButton {...props} $active={active}>{children}</ActiveButton>
      {active && <Particles ref={canvas} aria-hidden="true" />}
    </Shell>
  );
}
