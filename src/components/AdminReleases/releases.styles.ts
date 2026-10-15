'use client';

import styled from 'styled-components';

// Same stacking pattern as AdminUsers/users.styles.ts (duplicated on purpose;
// the re-skin consolidates admin tables).
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

export const Row = styled.tr``;

// Archived rows dim their text cells only, never the actions cell.
export const TextCell = styled.td<{ $muted?: boolean }>`
  opacity: ${({ $muted }) => ($muted ? 0.55 : 1)};
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

export const Status = styled.span<{ $tone?: 'error' | 'muted' }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $tone }) => ($tone === 'error' ? theme.colors.error : theme.colors.muted)};
`;

export const Group = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
`;

export const HeaderRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
`;

export const PlainList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space.xs};
`;
