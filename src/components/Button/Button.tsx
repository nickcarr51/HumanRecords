'use client';

import React from 'react';
import styled, { css, keyframes } from 'styled-components';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const sizeStyles: Record<Size, ReturnType<typeof css>> = {
  sm: css`
    font-size: ${({ theme }) => theme.fontSizes.xs};
    padding: 0.35rem 0.75rem;
  `,
  md: css`
    font-size: ${({ theme }) => theme.fontSizes.sm};
    padding: 0.55rem 1.1rem;
  `,
  lg: css`
    font-size: ${({ theme }) => theme.fontSizes.md};
    padding: 0.75rem 1.5rem;
  `,
};

const variantStyles: Record<Variant, ReturnType<typeof css>> = {
  primary: css`
    background: ${({ theme }) => theme.colors.accent};
    color: ${({ theme }) => theme.colors.bg};
    border: 1px solid ${({ theme }) => theme.colors.accent};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.colors.accentDim};
      border-color: ${({ theme }) => theme.colors.accentDim};
    }
  `,
  secondary: css`
    background: transparent;
    color: ${({ theme }) => theme.colors.text};
    border: 1px solid ${({ theme }) => theme.colors.border};
    &:hover:not(:disabled) {
      border-color: ${({ theme }) => theme.colors.accent};
      color: ${({ theme }) => theme.colors.accent};
    }
  `,
  ghost: css`
    background: transparent;
    color: ${({ theme }) => theme.colors.muted};
    border: 1px solid transparent;
    &:hover:not(:disabled) {
      color: ${({ theme }) => theme.colors.text};
    }
  `,
};

const StyledButton = styled.button<{ $variant: Variant; $size: Size }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-radius: ${({ theme }) => theme.radii.sm};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition:
    background ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease},
    color ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease},
    border-color ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease},
    transform ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.ease};
  ${({ $size }) => sizeStyles[$size]}
  ${({ $variant }) => variantStyles[$variant]}

  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const LoadingDot = styled.span`
  width: 0.8em;
  height: 0.8em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
  @media (prefers-reduced-motion: reduce) {
    animation-duration: 1.5s;
  }
`;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <StyledButton
      $variant={variant}
      $size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <LoadingDot aria-hidden="true" />}
      {children}
    </StyledButton>
  );
}
