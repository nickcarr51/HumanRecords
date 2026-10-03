'use client';

import styled from 'styled-components';
import { Mono } from '@/components/Mono';

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};

  th {
    text-align: left;
    font-family: ${({ theme }) => theme.fonts.mono};
    font-weight: normal;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
    padding: ${({ theme }) => theme.space.sm};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }

  td {
    vertical-align: top;
    padding: ${({ theme }) => theme.space.md} ${({ theme }) => theme.space.sm};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }

  /* Phones: each row becomes a stacked card. */
  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    thead {
      display: none;
    }
    tr,
    td {
      display: block;
    }
    tr {
      border: 1px solid ${({ theme }) => theme.colors.border};
      border-radius: ${({ theme }) => theme.radii.md};
      margin-bottom: ${({ theme }) => theme.space.md};
    }
    td {
      border-bottom: 0;
    }
  }
`;

export const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  min-width: 0;
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
`;

export const UrlText = styled(Mono)`
  display: block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.muted};
`;

export const Status = styled.span<{ $tone?: 'error' | 'muted' }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $tone }) => ($tone === 'error' ? theme.colors.error : theme.colors.muted)};
`;
