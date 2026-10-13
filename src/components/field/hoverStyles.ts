import { css, keyframes } from 'styled-components';
import { withAlpha } from '@/lib/theme/color';

// styled-components hashes keyframes by content, so deriving them from theme
// colors per render reuses the same animation name.
const trackingEcho = (accent: string, text: string) => keyframes`
  0% { filter: drop-shadow(2px 0 0 ${withAlpha(accent, 0.4)}); }
  30% { filter: drop-shadow(-1px 1px 0 ${withAlpha(accent, 0.3)}); }
  60% { filter: drop-shadow(1px 0 0 ${withAlpha(text, 0.2)}); }
  100% { filter: drop-shadow(0 0 0 transparent); }
`;

export const textHoverState = css`
  background-position: 0% 0;
  ${({ theme }) => theme.mode === 'dark' ? css`
    filter: drop-shadow(0 0 3px ${withAlpha(theme.colors.accent, 0.16)});
  ` : css`
    animation: ${trackingEcho(theme.colors.accent, theme.colors.text)} 200ms steps(4, end) both;
  `}
`;

export const iconSweepStyles = css`
  --hover-progress: 0;
  transition: --hover-progress 480ms ease, border-color 480ms ease;
  ${({ theme }) => theme.mode === 'light' && css`
    transition: --hover-progress 200ms steps(6, end), border-color 200ms steps(4, end);
  `}
  &:hover:not(:disabled), &:focus-visible {
    --hover-progress: 1;
    border-color: ${({ theme }) => theme.colors.accent};
    ${({ theme }) => theme.mode === 'light' && css`
      background: repeating-linear-gradient(0deg, ${withAlpha(theme.colors.accent, 0.06)} 0 1px, transparent 1px 4px);
      svg { animation: ${trackingEcho(theme.colors.accent, theme.colors.text)} 200ms steps(4, end) both; }
    `}
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover svg, &:focus-visible svg { animation: none; }
  }
`;

export const textSweepStyles = css`
  background-image: linear-gradient(90deg, ${({ theme }) => theme.colors.accent} 45%, ${({ theme }) => theme.colors.text} 55%);
  background-size: 240% 100%;
  background-position: 100% 0;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 3px ${({ theme }) => withAlpha(theme.colors.accent, 0)});
  transition: background-position 480ms ease, border-color 480ms ease, filter 480ms ease;
  ${({ theme }) => theme.mode === 'light' && css`
    background-image: linear-gradient(90deg, ${theme.colors.accent} 50%, ${theme.colors.text} 50%);
    transition: background-position 200ms steps(6, end), border-color 200ms steps(4, end);
    text-shadow: none;
    filter: none;
  `}
  &:hover:not(:disabled), &:focus-visible {
    ${textHoverState}
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover, &:focus-visible { animation: none; }
  }
  @media (forced-colors: active) {
    color: LinkText;
    background-image: none;
    filter: none;
  }
`;
