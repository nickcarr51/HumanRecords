import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFeed = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@/lib/supabase/feed', () => ({
  getFeed: (...a: unknown[]) => getFeed(...a),
  MAX_PAGE: 100_000,
  MAX_QUERY_LENGTH: 200,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

import FeedPage from './page';

beforeEach(() => vi.clearAllMocks());

const result = (total: number, totalPages: number) => ({
  items: [], page: 1, pageSize: 2, hasMore: false, total, totalPages,
});

describe('FeedPage', () => {
  it('redirects a page past the end to the last page, keeping the search', async () => {
    getFeed.mockResolvedValue(result(5, 3));
    await expect(FeedPage({ searchParams: Promise.resolve({ q: ' wav ', page: '9' }) })).rejects.toThrow(
      'REDIRECT /feed?q=wav&page=3',
    );
    expect(getFeed).toHaveBeenCalledWith({}, { page: 9, q: 'wav' });
  });

  it('redirects a past-the-end empty search to its page 1', async () => {
    getFeed.mockResolvedValue(result(0, 1));
    await expect(FeedPage({ searchParams: Promise.resolve({ q: 'zzz', page: '3' }) })).rejects.toThrow(
      'REDIRECT /feed?q=zzz',
    );
  });

  it('does not redirect an empty search on page 1', async () => {
    getFeed.mockResolvedValue(result(0, 1));
    await expect(FeedPage({ searchParams: Promise.resolve({ q: 'zzz' }) })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('ignores repeated q and page params instead of throwing', async () => {
    getFeed.mockResolvedValue(result(0, 1));
    await expect(
      FeedPage({ searchParams: Promise.resolve({ q: ['a', 'b'], page: ['2', '3'] }) }),
    ).resolves.toBeTruthy();
    expect(getFeed).toHaveBeenCalledWith({}, { page: 1, q: '' });
  });

  it('caps the search text at 200 characters', async () => {
    getFeed.mockResolvedValue(result(0, 1));
    await FeedPage({ searchParams: Promise.resolve({ q: 'x'.repeat(500) }) });
    expect(getFeed).toHaveBeenCalledWith({}, { page: 1, q: 'x'.repeat(200) });
  });
});
