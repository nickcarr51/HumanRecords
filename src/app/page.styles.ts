'use client';

import styled from 'styled-components';

export const Logo = styled.img`
  width: clamp(64px, 12vw, 96px);
  height: auto;
`;

export const Centered = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  text-align: center;
`;
