'use client';

import styled from 'styled-components';

// Fills the AppShell's Main region at a fixed height: the header stays put,
// the list scrolls, and pagination is pinned to the bottom of the screen.
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.lg};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.space.md};
`;

export const SearchSlot = styled.div`
  flex: 1;
  min-width: 200px;
`;

export const List = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

export const Empty = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  margin: ${({ theme }) => theme.space.md} 0 0;
`;

export const Foot = styled.div`
  flex-shrink: 0;
`;
