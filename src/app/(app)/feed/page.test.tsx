import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFeed = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@/lib/supabase/feed', () => ({ getFeed: (...a: unknown[]) => getFeed(...a) }));
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
});
