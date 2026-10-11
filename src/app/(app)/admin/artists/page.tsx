import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert } from '@/components/Alert';
import { Heading } from '@/components/Heading';
import { ArtistsTable } from '@/components/AdminArtists';
import { listAdminArtists } from '@/lib/admin/artists';
import type { AdminArtistsPage } from '@/lib/admin/artists-types';
import { requireLabelMember } from '@/lib/auth/role';
import { createClient } from '@/lib/supabase/server';
// SearchInput/Pagination still live under the retired /artists route; worktree 2
// moves them to src/components/. Update these imports after that merges.
import { SearchInput } from '../../artists/SearchInput';
import { Pagination, pageHref } from '../../artists/Pagination';
import { Back, ButtonLink, Page, PageHead } from '../admin.styles';

export const metadata: Metadata = { title: 'Admin · Artists' };

const BASE = '/admin/artists';

export default async function AdminArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();

  const sp = await searchParams;
  const query = (sp.q ?? '').trim();
  const requested = Number(sp.page);
  const page = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1;

  let result: AdminArtistsPage | null = null;
  try {
    result = await listAdminArtists(await createClient(), { query, page });
  } catch (err) {
    console.error('Failed to load artists', err);
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  // redirect() throws; keep it outside the try/catch above.
  if (result && result.total > 0 && page > totalPages) redirect(pageHref(query, totalPages, BASE));

  return (
    <Page>
      <Back href="/admin">‹ admin</Back>
      <PageHead>
        <Heading $level={2}>Artists</Heading>
        <ButtonLink href={`${BASE}/new`} $variant="primary" $size="sm">
          New artist
        </ButtonLink>
      </PageHead>
      <SearchInput initialQuery={query} />
      {result ? (
        <>
          <ArtistsTable artists={result.artists} query={query} />
          <Pagination query={query} page={page} totalPages={totalPages} basePath={BASE} />
        </>
      ) : (
        <Alert $tone="error" role="alert">
          Couldn&apos;t load artists.
        </Alert>
      )}
    </Page>
  );
}
