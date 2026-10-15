'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Short horizontal tracking tears without duplicating the form or its inputs. */
export function SignInGlitch({ children }: { children: ReactNode }) {
  const id = `signin-glitch-${useId().replace(/:/g, '')}`;
  const content = useRef<HTMLDivElement>(null);
  const displacement = useRef<SVGFEDisplacementMapElement>(null);
  const noise = useRef<SVGFETurbulenceElement>(null);

  useEffect(() => {
    const layer = content.current;
    if (!layer) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout>;
    let pulse: ReturnType<typeof setTimeout>;
    function clear() {
      clearTimeout(timer);
      clearTimeout(pulse);
      layer!.style.filter = '';
      layer!.style.transform = '';
      displacement.current?.setAttribute('scale', '0');
    }
    function schedule(initial = false) {
      if (document.hidden || reduced?.matches) return;
      timer = setTimeout(burst, initial ? 6000 + Math.random() * 8000 : 18000 + Math.random() * 17000);
    }
    function burst() {
      if (document.hidden || reduced?.matches) return;
      noise.current?.setAttribute('seed', String(Math.floor(Math.random() * 1000)));
      noise.current?.setAttribute('baseFrequency', `0.0001 ${0.06 + Math.random() * 0.12}`);
      layer!.style.filter = `url("#${id}")`;
      let step = 0;
      const steps = 2 + Math.floor(Math.random() * 4);
      const strength = 3 + Math.random() * 6;
      function tear() {
        if (step++ >= steps) {
          layer!.style.filter = '';
          layer!.style.transform = '';
          displacement.current?.setAttribute('scale', '0');
          schedule();
          return;
        }
        displacement.current?.setAttribute('scale', String(strength * (0.35 + Math.random() * 0.65)));
        layer!.style.transform = `translateX(${(Math.random() - 0.5) * 1.5}px) skewX(${(Math.random() - 0.5) * 0.2}deg)`;
        noise.current?.setAttribute('seed', String(Math.floor(Math.random() * 1000)));
        pulse = setTimeout(tear, 35 + Math.random() * 55);
      }
      tear();
    }
    function resume() { clear(); schedule(); }
    document.addEventListener('visibilitychange', resume);
    reduced?.addEventListener('change', resume);
    schedule(true);
    return () => {
      clear();
      document.removeEventListener('visibilitychange', resume);
      reduced?.removeEventListener('change', resume);
    };
  }, [id]);

  return <>
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feTurbulence ref={noise} type="fractalNoise" baseFrequency="0.0001 0.12" numOctaves="1" seed="1" result="noise" />
          <feComponentTransfer in="noise" result="horizontal">
            <feFuncR type="discrete" tableValues="0 0 1 0.5 1 0" />
            <feFuncB type="linear" slope="0" intercept="0.5" />
          </feComponentTransfer>
          <feDisplacementMap ref={displacement} in="SourceGraphic" in2="horizontal" scale="0" xChannelSelector="R" yChannelSelector="B" />
        </filter>
      </defs>
    </svg>
    <div ref={content}>{children}</div>
  </>;
}
