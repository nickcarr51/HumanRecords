'use client';

import { useId, type SVGProps } from 'react';
import { useTheme } from 'styled-components';

/** Reveal a second orange drawing from left to right on the parent's hover. */
export function SweepIcon({ children, ...props }: SVGProps<SVGSVGElement>) {
  const id = `icon-${useId().replace(/:/g, '')}`;
  const theme = useTheme();
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props} style={{ overflow: 'visible', ...props.style }}>
      <defs>
        <clipPath id={id}>
          <rect width="24" height="24" style={{ transform: 'scaleX(var(--hover-progress, 0))', transformOrigin: '0 0' }} />
        </clipPath>
      </defs>
      <g>{children}</g>
      <g clipPath={`url(#${id})`} fill={props.fill} stroke={props.stroke} style={{ color: theme.colors.accent }}>{children}</g>
    </svg>
  );
}
