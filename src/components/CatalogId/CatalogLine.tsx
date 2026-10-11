'use client';

import styled from 'styled-components';
import { CatalogId } from './CatalogId';

const Line = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.sm};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  line-height: 1.4;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.muted};
  > * + * {
    border-left: 1px solid ${({ theme }) => theme.colors.border};
    padding-left: ${({ theme }) => theme.space.sm};
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    > * + * {
      display: none;
    }
  }
`;

export function CatalogLine({ kind, number, issuedAt, slot, total }: {
  kind: 'album' | 'track';
  number?: number;
  issuedAt?: string;
  slot?: number;
  total?: number;
}) {
  const date = issuedAt ? new Date(issuedAt) : null;
  const validDate = date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  return <Line>
    <CatalogId kind={kind} number={number} />
    {validDate && <time dateTime={validDate}>ISSUED {validDate.replaceAll('-', '.')}</time>}
    {total !== undefined && <span>{slot !== undefined ? `TRACK ${String(slot).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : `TRACKS ${String(total).padStart(2, '0')}`}</span>}
  </Line>;
}
