import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAlbum = vi.fn();
const getMyDownloadedTrackIds = vi.fn();
const client = { tag: 'user-client' };
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/albums', () => ({ getAlbum: (...a: unknown[]) => getAlbum(...a) }));
vi.mock('@/lib/supabase/downloads', () => ({
  getMyDownloadedTrackIds: (...a: unknown[]) => getMyDownloadedTrackIds(...a),
}));
vi.mock('@/components', () => ({
  AlbumTracks: () => null,
  DownloadsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import AlbumPage, { generateMetadata } from './page';

const ID = '11111111-1111-1111-1111-111111111111';
const album = {
  id: ID, title: 'Night Drive', albumArtUrl: null, artistNames: ['Nova'],
  tracks: [{ id: 't1', title: 'x', artistNames: [] }, { id: 't2', title: 'y', artistNames: [] }],
};
const params = Promise.resolve({ id: ID });

beforeEach(() => vi.clearAllMocks());

describe('AlbumPage', () => {
  it('titles the tab with the album title', async () => {
    getAlbum.mockResolvedValue(album);
    expect(await generateMetadata({ params })).toEqual({ title: 'Night Drive' });
  });

  it('keeps the default title for a missing album', async () => {
    getAlbum.mockResolvedValue(null);
    expect(await generateMetadata({ params })).toEqual({});
  });

  it("loads the caller's downloaded ids for the album's tracks", async () => {
    getAlbum.mockResolvedValue(album);
    getMyDownloadedTrackIds.mockResolvedValue([]);
    expect(await AlbumPage({ params })).toBeTruthy();
    expect(getMyDownloadedTrackIds).toHaveBeenCalledWith(client, ['t1', 't2']);
  });

  it('404s for a missing album', async () => {
    getAlbum.mockResolvedValue(null);
    await expect(AlbumPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
