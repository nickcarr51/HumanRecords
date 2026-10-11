import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';

const playQueue = vi.fn();
vi.mock('@/components/Player', async () => {
  const actual = await vi.importActual<typeof import('@/components/Player/queue')>('@/components/Player/queue');
  return {
    toPlayerTrack: actual.toPlayerTrack,
    usePlayer: () => ({ playQueue, toggle: vi.fn(), currentTrack: null, isPlaying: false, status: 'idle' }),
  };
});

import { AlbumTracks } from './AlbumTracks';

describe('AlbumTracks on the album page', () => {
  it('plays the album as its own queue with an album source', () => {
    renderWithTheme(
      <AlbumTracks
        albumId="al1"
        tracks={[
          { id: 't1', title: 'First', artistNames: [] },
          { id: 't2', title: 'Second', artistNames: [] },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play Second' }));
    const [queue, index, source] = playQueue.mock.calls.at(-1)!;
    expect((queue as Array<{ id: string }>).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(index).toBe(1);
    expect(source).toEqual({ kind: 'album', albumId: 'al1' });
  });
});
