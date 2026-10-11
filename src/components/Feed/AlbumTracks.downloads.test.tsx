import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import type { FeedTrack } from '@/lib/supabase/feed';

vi.mock('@/components/Player', async () => {
  const actual = await vi.importActual<typeof import('@/components/Player/PlayerProvider')>(
    '@/components/Player/PlayerProvider',
  );
  return {
    toPlayerTrack: actual.toPlayerTrack,
    usePlayer: () => ({
      playQueue: vi.fn(),
      toggle: vi.fn(),
      currentTrack: null,
      isPlaying: false,
      status: 'idle',
    }),
  };
});
vi.mock('@/lib/storage/actions', () => ({ getTrackDownloadUrl: vi.fn() }));
vi.mock('@/components/Downloads/navigate', () => ({ navigateTo: vi.fn() }));

import { getTrackDownloadUrl } from '@/lib/storage/actions';
import { DownloadsProvider } from '@/components/Downloads';
import { ToastProvider } from '@/components/Toast';
import { AlbumTracks } from './AlbumTracks';

const tracks: FeedTrack[] = [
  { catalogNumber: 3, id: 't1', title: 'FIRST LIGHT', artistNames: ['Halcyon'] },
  { catalogNumber: 4, id: 't2', title: 'NIGHT SHIFT', artistNames: ['Juno Park'] },
];

beforeEach(() => {
  vi.mocked(getTrackDownloadUrl).mockReset();
});

describe('AlbumTracks with real download buttons', () => {
  it('marks downloaded tracks from DownloadsProvider', () => {
    renderWithTheme(
      <ToastProvider>
        <DownloadsProvider initialIds={['t1']}>
          <AlbumTracks tracks={tracks} />
        </DownloadsProvider>
      </ToastProvider>,
    );
    const done = screen.getByRole('button', { name: 'Downloaded — download FIRST LIGHT again' });
    expect(done).toBeInTheDocument();
    const fresh = screen.getByRole('button', { name: 'Download NIGHT SHIFT' });
    expect(fresh).toBeInTheDocument();
  });

  it('renders and survives a failed download with no providers', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getTrackDownloadUrl).mockResolvedValue({ url: null, error: 'Track not found.' });
    renderWithTheme(<AlbumTracks tracks={tracks} />);
    const btn = screen.getByRole('button', { name: 'Download FIRST LIGHT' });
    expect(screen.getByRole('button', { name: 'Download NIGHT SHIFT' })).toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() => expect(errSpy).toHaveBeenCalled());
    await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'false'));
    expect(screen.getByRole('button', { name: 'Download FIRST LIGHT' })).toBeInTheDocument();
    errSpy.mockRestore();
  });
});
