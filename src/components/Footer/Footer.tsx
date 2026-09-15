'use client';

import styled from 'styled-components';

export const Footer = styled.footer`
  padding: ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.faint};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: center;
`;
