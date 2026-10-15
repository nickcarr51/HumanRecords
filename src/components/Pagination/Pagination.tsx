'use client';

import Link from 'next/link';
import styled from 'styled-components';
import { pageHref } from './pageHref';
import { textSweepStyles } from '@/components/field/hoverStyles';

const Bar = styled.nav`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space.lg};
  padding: ${({ theme }) => theme.space.lg} 0;
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.space.sm} 0;
  }
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const PageLink = styled(Link)`
  ${textSweepStyles}
  text-decoration: none;
  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`;

export function Pagination({
  basePath,
  query,
  page,
  totalPages,
}: {
  basePath: string;
  query: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <Bar aria-label="Pagination">
      {page > 1 ? <PageLink href={pageHref(basePath, query, page - 1)}>‹ prev</PageLink> : <span />}
      <span>
        page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <PageLink href={pageHref(basePath, query, page + 1)}>next ›</PageLink>
      ) : (
        <span />
      )}
    </Bar>
  );
}
