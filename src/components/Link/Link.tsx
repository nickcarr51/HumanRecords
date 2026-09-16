'use client';

import styled from 'styled-components';

export const Link = styled.a`
  color: ${({ theme }) => theme.colors.accent};
  font-family: ${({ theme }) => theme.fonts.mono};
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color ${({ theme }) => theme.motion.base}
    ${({ theme }) => theme.motion.ease};
  &:hover {
    border-bottom-color: ${({ theme }) => theme.colors.accent};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: 2px;
  }
`;
