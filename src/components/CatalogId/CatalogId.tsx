'use client';

import styled from 'styled-components';

const Stamp = styled.span`
  display: inline-block;
  width: fit-content;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  line-height: 1.4;
  letter-spacing: 0.12em;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

export function CatalogId({ kind, number }: { kind: 'album' | 'track'; number?: number }) {
  if (!number || !Number.isSafeInteger(number) || number < 0) return null;
  const code = `${kind === 'album' ? 'HS' : 'HSS'}${String(number).padStart(3, '0')}`;
  return <Stamp aria-label={`${kind === 'album' ? 'Album' : 'Track'} catalog ${code}`}>{code}</Stamp>;
}
