'use client';

import styled from 'styled-components';

/** Full-height, centered page shell shared by the standalone screens. */
export const Screen = styled.main`
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space.lg};
  background: ${({ theme }) => theme.colors.bg};
`;
