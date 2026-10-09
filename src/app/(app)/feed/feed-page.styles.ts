'use client';

import styled from 'styled-components';

// Fills the AppShell Main region: header stays put, the list scrolls.
export const Page = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.lg};
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
`;

export const Header = styled.div`
  flex-shrink: 0;
  margin-bottom: ${({ theme }) => theme.space.md};
`;

export const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;
