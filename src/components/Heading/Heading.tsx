'use client';

import styled from 'styled-components';

type Level = 1 | 2 | 3 | 4;

const levelSize = { 1: '4xl', 2: '2xl', 3: 'xl', 4: 'lg' } as const;

export const Heading = styled.h2<{ $level?: Level }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme, $level = 2 }) => theme.fontSizes[levelSize[$level]]};
  letter-spacing: -0.01em;
  line-height: 1.1;
  margin: 0;
`;
