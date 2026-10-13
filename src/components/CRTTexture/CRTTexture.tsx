'use client';

import { useEffect, useId, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { rgbTriplet, withAlpha } from '@/lib/theme/color';

/**
 * The CRT layer is two fixed elements and no render loop:
 *
 * - `Scanlines`: the base wash, 1 px scanlines every 4 px, and the radial vignette, all
 *   CSS gradients the browser paints once and caches. The slow brightness pulse is an
 *   `opacity` animation, which the compositor blends without repainting (desktop only;
 *   phones keep the layer static so the display can idle).
 * - `Band`: the occasional tracking sweep. One `element.animate()` moves it across the
 *   viewport on the compositor (transform + opacity); the glow and the dashed "tracking
 *   noise" line are static backgrounds that travel with it. Between sweeps it is
 *   `visibility: hidden`, so its backdrop filter costs nothing.
 *
 * The only JavaScript that runs is a timer between sweeps. The earlier canvas version
 * repainted the full viewport 24 times a second (60 during a sweep) to bend each scanline
 * by under a pixel; that drift and the wobble lines are the only things this drops.
 */

const pulse = keyframes`
  from { opacity: 0.7; }
  to { opacity: 1; }
`;

const Scanlines = styled.div`
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: ${({ theme }) => theme.zIndex.toast + 1};
  background-color: ${({ theme }) => withAlpha(theme.effects.ink, 0.02)};
  background-image:
    radial-gradient(
      farthest-corner at 50% 50%,
      ${({ theme }) => withAlpha(theme.effects.vignette, 0)} 35%,
      ${({ theme }) => withAlpha(theme.effects.vignette, 0.055)} 100%
    ),
    repeating-linear-gradient(
      to bottom,
      ${({ theme }) => withAlpha(theme.effects.ink, theme.mode === 'dark' ? 0.06 : 0.029)} 0 1px,
      transparent 1px 4px
    );
  animation: ${pulse} 3.9s ease-in-out infinite alternate;
  &[data-paused='true'] {
    animation-play-state: paused;
  }
  @media (hover: none), (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Band = styled.div`
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  will-change: transform, opacity;
  z-index: ${({ theme }) => theme.zIndex.toast + 1};
  --sweep-strength: 0.03;
  background-image:
    linear-gradient(
      to bottom,
      transparent,
      rgba(${({ theme }) => rgbTriplet(theme.effects.ink)}, var(--sweep-strength)) 50%,
      transparent
    ),
    repeating-linear-gradient(
      to right,
      ${({ theme }) => withAlpha(theme.effects.ink, 0.035)} 0 12px,
      transparent 12px 48px
    );
  background-size: 100% 100%, 100% 1px;
  background-position: 0 0, 0 calc(50% + 12px);
  background-repeat: no-repeat;
  mask-image: linear-gradient(to bottom, transparent, black 35%, black 65%, transparent);
`;

const SWEEP_MARGIN = 80;
const firstDelay = () => 2000 + Math.random() * 3000;
const restDelay = () => 4000 + Math.random() * 7000;

/** Static CSS scanlines/vignette plus a compositor-driven tracking sweep. */
export function CRTTexture() {
  const layer = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const filterId = `crt-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const scanlines = layer.current;
    const element = band.current;
    if (!scanlines || !element || !window.matchMedia) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer = 0;
    let running: Animation | null = null;

    const stop = () => {
      window.clearTimeout(timer);
      timer = 0;
      running?.cancel();
      running = null;
      element.style.visibility = 'hidden';
    };

    const sweep = () => {
      timer = 0;
      // jsdom has no Web Animations; the sweep is decoration, so skip quietly.
      if (document.hidden || reduced.matches || typeof element.animate !== 'function') return;
      const viewport = window.innerHeight;
      const thickness = 8 + Math.random() * 20;
      const height = thickness * 4;
      const downward = Math.random() > 0.5;
      const from = downward ? -SWEEP_MARGIN - height : viewport + SWEEP_MARGIN;
      const to = downward ? viewport + SWEEP_MARGIN : -SWEEP_MARGIN - height;
      element.style.height = `${height}px`;
      element.style.setProperty('--sweep-strength', (0.02 + Math.random() * 0.015).toFixed(3));
      element.style.visibility = 'visible';
      running = element.animate(
        [
          { transform: `translateY(${from}px)`, opacity: 0, easing: 'ease-in' },
          { opacity: 1, offset: 0.5, easing: 'ease-out' },
          { transform: `translateY(${to}px)`, opacity: 0 },
        ],
        { duration: 5500 + Math.random() * 2500, fill: 'none' },
      );
      running.onfinish = () => {
        running = null;
        element.style.visibility = 'hidden';
        timer = window.setTimeout(sweep, restDelay());
      };
    };

    // Called on mount, on visibility change, and when reduced motion toggles:
    // nothing runs while the page is hidden or motion is reduced.
    const restart = () => {
      stop();
      scanlines.dataset.paused = document.hidden ? 'true' : 'false';
      if (document.hidden || reduced.matches) return;
      timer = window.setTimeout(sweep, firstDelay());
    };

    restart();
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
    };
  }, []);

  // Chrome/Firefox wobble the page under the band; Safari ignores `backdrop-filter: url()`.
  const filter = `url("#${filterId}") blur(0.1px)`;
  return (
    <>
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <filter id={filterId} x="-5%" y="-20%" width="110%" height="140%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.08" numOctaves="1" seed="9" result="tracking" />
            <feDisplacementMap in="SourceGraphic" in2="tracking" scale="1" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <Scanlines ref={layer} aria-hidden="true" data-testid="crt-scanlines" />
      <Band ref={band} aria-hidden="true" data-testid="crt-band" style={{ backdropFilter: filter, WebkitBackdropFilter: filter }} />
    </>
  );
}
