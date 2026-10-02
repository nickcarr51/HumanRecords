import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import type { FeedItem } from '@/lib/supabase/feed';

const playQueue = vi.fn();
vi.mock('@/components/Player', async () => {
  const actual = await vi.importActual<typeof import('@/components/Player/PlayerProvider')>(
    '@/components/Player/PlayerProvider',
  );
  return { toPlayerTrack: actual.toPlayerTrack, usePlayer: () => ({ playQueue }) };
});
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode; href: string }) => <a {...rest}>{children}</a>,
}));

import { FeedList } from './FeedList';

const items: FeedItem[] = [
  { kind: 'track', id: 's1', title: 'Newest Single', trackArtUrl: null, artistNames: ['Daye'], createdAt: '2026-01-03' },
  {
    kind: 'album',
    id: 'a1',
    title: 'The Breaks',
    albumArtUrl: null,
    artistNames: [],
    createdAt: '2026-01-02',
    tracks: [
      { id: 'a1t1', title: 'ASSUMPTIONS', artistNames: ['Castillonaire'] },
      { id: 'a1t2', title: 'JERK CLUB TOOL', artistNames: ['Quinoa Jones'] },
    ],
  },
  { kind: 'track', id: 's2', title: 'Older Single', trackArtUrl: null, artistNames: [], createdAt: '2026-01-01' },
];

const feedIds = ['s1', 'a1t1', 'a1t2', 's2'];

function queuedIds(): string[] {
  const [queue] = playQueue.mock.calls.at(-1)!;
  return (queue as Array<{ id: string }>).map((t) => t.id);
}

beforeEach(() => playQueue.mockClear());

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
    fireEvent.click(screen.getByRole('button', { name: 'Play JERK CLUB TOOL' }));
    expect(queuedIds()).toEqual(feedIds);
    expect(playQueue.mock.calls.at(-1)![1]).toBe(2);
  });
});
