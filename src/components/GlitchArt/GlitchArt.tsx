'use client';

import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const Frame = styled.span`
  display: block;
  position: relative;
  overflow: hidden;
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
`;

/** Brief horizontal image tears, drawn from the image without reading its pixels. */
export function GlitchArt({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const image = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const layer = canvas.current;
    const img = image.current;
    if (!layer || !img || !hovered || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = width * ratio;
    layer.height = height * ratio;
    ctx.scale(ratio, ratio);
    let frame = 0;
    let last = -Infinity;
    const start = performance.now();
    function draw(now: number) {
      if (!ctx || !img) return;
      if (now - last > 90) {
        last = now;
        ctx.clearRect(0, 0, width, height);
        if (img.complete && img.naturalWidth && (now - start < 450 || Math.random() > 0.65)) {
          const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
          const sx = (img.naturalWidth - width / scale) / 2;
          const sy = (img.naturalHeight - height / scale) / 2;
          ctx.drawImage(img, sx, sy, width / scale, height / scale, 0, 0, width, height);
          for (let i = 0; i < 4; i++) {
            const y = Math.random() * (height - 8);
            const slice = 2 + Math.random() * 6;
            const offset = (Math.random() - 0.5) * 12;
            ctx.drawImage(img, sx, sy + y / scale, width / scale, slice / scale, offset, y, width, slice);
          }
        }
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, width, height); };
  }, [hovered, src]);
  return (
    <Frame className={className} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={src} alt={alt} />
      <canvas ref={canvas} aria-hidden="true" />
    </Frame>
  );
}
