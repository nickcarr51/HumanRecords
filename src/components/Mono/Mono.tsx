'use client';

import styled from 'styled-components';

export const Mono = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.text};
`;
