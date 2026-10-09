import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import type { FeedItem } from '@/lib/supabase/feed';

const playQueue = vi.fn();
const toggle = vi.fn();
let player: { currentTrack: { id: string } | null; isPlaying: boolean; status: string } = {
  currentTrack: null,
  isPlaying: false,
  status: 'idle',
};
vi.mock('@/components/Player', async () => {
  const actual = await vi.importActual<typeof import('@/components/Player/PlayerProvider')>(
    '@/components/Player/PlayerProvider',
  );
  return {
    toPlayerTrack: actual.toPlayerTrack,
    usePlayer: () => ({ playQueue, toggle, ...player }),
  };
});
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode; href: string }) => <a {...rest}>{children}</a>,
}));

import { FeedList } from './FeedList';

const items: FeedItem[] = [
  { kind: 'track', id: 's1', title: 'Newest Single', trackArtUrl: null, artistNames: ['Nova'], createdAt: '2026-01-03' },
  {
    kind: 'album',
    id: 'a1',
    title: 'Sample Album',
    albumArtUrl: null,
    artistNames: [],
    createdAt: '2026-01-02',
    tracks: [
      { id: 'a1t1', title: 'FIRST LIGHT', artistNames: ['Halcyon'] },
      { id: 'a1t2', title: 'NIGHT SHIFT', artistNames: ['Juno Park'] },
    ],
  },
  { kind: 'track', id: 's2', title: 'Older Single', trackArtUrl: null, artistNames: [], createdAt: '2026-01-01' },
];

const feedIds = ['s1', 'a1t1', 'a1t2', 's2'];

function queuedIds(): string[] {
  const [queue] = playQueue.mock.calls.at(-1)!;
  return (queue as Array<{ id: string }>).map((t) => t.id);
}

beforeEach(() => {
  playQueue.mockClear();
  toggle.mockClear();
  player = { currentTrack: null, isPlaying: false, status: 'idle' };
});

describe('FeedList playback queue', () => {
  it('playing a single queues the whole feed, starting at that single', () => {
    renderWithTheme(<FeedList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Older Single' }));
    expect(queuedIds()).toEqual(feedIds);
    expect(playQueue.mock.calls.at(-1)![1]).toBe(3);
  });

  it('playing an album queues the whole feed, starting at its first track', () => {
    renderWithTheme(<FeedList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play album' }));
    expect(queuedIds()).toEqual(feedIds);
    expect(playQueue.mock.calls.at(-1)![1]).toBe(1);
  });

  it('playing a track inside an expanded album starts at that track in the feed queue', () => {
    renderWithTheme(<FeedList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand tracks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play NIGHT SHIFT' }));
    expect(queuedIds()).toEqual(feedIds);
    expect(playQueue.mock.calls.at(-1)![1]).toBe(2);
  });
});

describe('FeedList play/pause state', () => {
  it('shows pause on the playing single and pauses it instead of restarting', () => {
    player = { currentTrack: { id: 's2' }, isPlaying: true, status: 'playing' };
    renderWithTheme(<FeedList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause Older Single' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(playQueue).not.toHaveBeenCalled();
    // Other rows are unaffected.
    expect(screen.getByRole('button', { name: 'Play Newest Single' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play album' })).toBeInTheDocument();
  });

  it('a paused current track shows play and resumes (toggle), not restart', () => {
    player = { currentTrack: { id: 's2' }, isPlaying: false, status: 'idle' };
    renderWithTheme(<FeedList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Older Single' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(playQueue).not.toHaveBeenCalled();
  });

  it('album button shows pause while any of its tracks plays, and pauses rather than restarting', () => {
    player = { currentTrack: { id: 'a1t2' }, isPlaying: true, status: 'playing' };
    renderWithTheme(<FeedList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause album' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(playQueue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand tracks' }));
    expect(screen.getByRole('button', { name: 'Pause NIGHT SHIFT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play FIRST LIGHT' })).toBeInTheDocument();
  });

  it('while the current track is loading, shows pause and ignores clicks', () => {
    player = { currentTrack: { id: 's1' }, isPlaying: false, status: 'loading' };
    renderWithTheme(<FeedList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause Newest Single' }));
    expect(toggle).not.toHaveBeenCalled();
    expect(playQueue).not.toHaveBeenCalled();
  });

  it('a current track that errored restarts it via playQueue (retry)', () => {
    player = { currentTrack: { id: 's1' }, isPlaying: false, status: 'error' };
    renderWithTheme(<FeedList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Newest Single' }));
    expect(playQueue).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();
  });
});
