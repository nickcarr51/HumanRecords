'use client';

import styled from 'styled-components';

type Variant = 'body' | 'muted' | 'small';

export const Text = styled.p<{ $variant?: Variant }>`
  font-family: ${({ theme }) => theme.fonts.display};
  margin: 0;
  line-height: 1.6;
  color: ${({ theme, $variant }) =>
    $variant === 'muted' ? theme.colors.muted : theme.colors.text};
  font-size: ${({ theme, $variant }) =>
    $variant === 'small' ? theme.fontSizes.sm : theme.fontSizes.md};
`;
