'use client';

import styled from 'styled-components';

// Centers the dashboard card within the AppShell's fixed-height Main region
// (the shared Screen shell is for the full-viewport, chrome-less pages).
export const Center = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space.lg};
  box-sizing: border-box;
`;
