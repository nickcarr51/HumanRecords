'use client';

import styled from 'styled-components';

export const Radio = styled.input.attrs({ type: 'radio' })`
  appearance: none;
  width: 1.1rem;
  height: 1.1rem;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill};
  background: ${({ theme }) => theme.colors.bg};
  cursor: pointer;
  display: inline-grid;
  place-content: center;
  transition: border-color ${({ theme }) => theme.motion.base}
    ${({ theme }) => theme.motion.ease};

  &::before {
    content: '';
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    transform: scale(0);
    transition: transform ${({ theme }) => theme.motion.fast}
      ${({ theme }) => theme.motion.ease};
    background: ${({ theme }) => theme.colors.accent};
  }
  &:checked {
    border-color: ${({ theme }) => theme.colors.accent};
  }
  &:checked::before {
    transform: scale(1);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    &::before { transition: none; }
  }
`;
