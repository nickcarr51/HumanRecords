import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFeed = vi.fn();
const getMyDownloadedTrackIds = vi.fn();
const client = { tag: 'user-client' };
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => client) }));
vi.mock('@/lib/supabase/feed', () => ({
  getFeed: (...a: unknown[]) => getFeed(...a),
  MAX_PAGE: 100_000,
  MAX_QUERY_LENGTH: 200,
}));
vi.mock('@/lib/supabase/downloads', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase/downloads')>()),
  getMyDownloadedTrackIds: (...a: unknown[]) => getMyDownloadedTrackIds(...a),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

import FeedPage, { metadata } from './page';

beforeEach(() => {
  vi.clearAllMocks();
  getMyDownloadedTrackIds.mockResolvedValue([]);
});

const result = (total: number, totalPages: number, items: unknown[] = []) => ({
  items, page: 1, pageSize: 2, hasMore: false, total, totalPages,
});
const params = (sp: Record<string, string | string[]>) => ({ searchParams: Promise.resolve(sp) });

describe('FeedPage', () => {
  it('sets the tab title to Feed', () => {
    expect(metadata.title).toBe('Feed');
  });

  it("loads the caller's downloaded ids for every track on the page", async () => {
    getFeed.mockResolvedValue(
      result(2, 1, [
        { kind: 'track', id: 's1', title: 'S', trackArtUrl: null, artistNames: [], createdAt: '' },
        { kind: 'album', id: 'a1', title: 'A', albumArtUrl: null, artistNames: [], createdAt: '',
          tracks: [{ id: 't1', title: 'x', artistNames: [] }] },
      ]),
    );
    getMyDownloadedTrackIds.mockResolvedValue(['t1']);
    expect(await FeedPage(params({}))).toBeTruthy();
    expect(getMyDownloadedTrackIds).toHaveBeenCalledWith(client, ['s1', 't1']);
  });

  it('redirects a page past the end to the last page, keeping the search', async () => {
    getFeed.mockResolvedValue(result(5, 3));
    await expect(FeedPage(params({ q: ' wav ', page: '9' }))).rejects.toThrow('REDIRECT /feed?q=wav&page=3');
    expect(getFeed).toHaveBeenCalledWith(client, { page: 9, q: 'wav' });
  });

  it('redirects a past-the-end empty search to its page 1', async () => {
    getFeed.mockResolvedValue(result(0, 1));
    await expect(FeedPage(params({ q: 'zzz', page: '3' }))).rejects.toThrow('REDIRECT /feed?q=zzz');
  });

  it('does not redirect an empty search on page 1', async () => {
    getFeed.mockResolvedValue(result(0, 1));
    await expect(FeedPage(params({ q: 'zzz' }))).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('ignores repeated q and page params instead of throwing', async () => {
    getFeed.mockResolvedValue(result(0, 1));
    await expect(FeedPage(params({ q: ['a', 'b'], page: ['2', '3'] }))).resolves.toBeTruthy();
    expect(getFeed).toHaveBeenCalledWith(client, { page: 1, q: '' });
  });

  it('caps the search text at 200 characters', async () => {
    getFeed.mockResolvedValue(result(0, 1));
    await FeedPage(params({ q: 'x'.repeat(500) }));
    expect(getFeed).toHaveBeenCalledWith(client, { page: 1, q: 'x'.repeat(200) });
  });
});
