'use client';

import styled from 'styled-components';

export const Page = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.lg};
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.lg};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.space.lg};
`;

export const SearchSlot = styled.div`
  flex: 1;
  min-width: 200px;
`;

export const List = styled.div`
  display: flex;
  flex-direction: column;
`;
