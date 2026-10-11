import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFeed = vi.fn();
const getMyDownloadedTrackIds = vi.fn();
const client = { tag: 'user-client' };
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/feed', () => ({ getFeed: (...a: unknown[]) => getFeed(...a) }));
vi.mock('@/lib/supabase/downloads', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase/downloads')>()),
  getMyDownloadedTrackIds: (...a: unknown[]) => getMyDownloadedTrackIds(...a),
}));
vi.mock('@/components', () => ({
  Heading: () => null,
  FeedList: () => null,
  DownloadsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import FeedPage, { metadata } from './page';

beforeEach(() => vi.clearAllMocks());

describe('FeedPage', () => {
  it('sets the tab title to Feed', () => {
    expect(metadata.title).toBe('Feed');
  });

  it("loads the caller's downloaded ids for every track on the page", async () => {
    getFeed.mockResolvedValue({
      items: [
        { kind: 'track', id: 's1', title: 'S', trackArtUrl: null, artistNames: [], createdAt: '' },
        { kind: 'album', id: 'a1', title: 'A', albumArtUrl: null, artistNames: [], createdAt: '',
          tracks: [{ id: 't1', title: 'x', artistNames: [] }] },
      ],
    });
    getMyDownloadedTrackIds.mockResolvedValue(['t1']);
    expect(await FeedPage()).toBeTruthy();
    expect(getMyDownloadedTrackIds).toHaveBeenCalledWith(client, ['s1', 't1']);
  });
});
