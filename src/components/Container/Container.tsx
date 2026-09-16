'use client';

import styled from 'styled-components';

export const Container = styled.div<{ $max?: string }>`
  width: 100%;
  max-width: ${({ $max = '1024px' }) => $max};
  margin-inline: auto;
  padding-inline: ${({ theme }) => theme.space.lg};
`;
