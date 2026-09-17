'use client';

import Link from 'next/link';
import styled from 'styled-components';

export function pageHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/artists?${qs}` : '/artists';
}

const Bar = styled.nav`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space.lg};
  padding: ${({ theme }) => theme.space.lg} 0;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const PageLink = styled(Link)`
  color: ${({ theme }) => theme.colors.accent};
  text-decoration: none;
  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`;

export function Pagination({
  query,
  page,
  totalPages,
}: {
  query: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <Bar aria-label="Pagination">
      {page > 1 ? <PageLink href={pageHref(query, page - 1)}>‹ prev</PageLink> : <span />}
      <span>
        page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <PageLink href={pageHref(query, page + 1)}>next ›</PageLink>
      ) : (
        <span />
      )}
    </Bar>
  );
}
