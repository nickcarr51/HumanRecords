import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const replace = vi.fn();
let player: { currentTrack: { id: string; page?: number } | null; source: { kind: string; q?: string } };
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/components/Player', () => ({ usePlayer: () => player }));

import { FollowPlayingPage } from './FollowPlayingPage';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
}

beforeEach(() => {
  replace.mockClear();
  setHidden(false);
  player = { currentTrack: { id: 't1', page: 3 }, source: { kind: 'feed', q: '' } };
});
afterEach(() => setHidden(false));

describe('FollowPlayingPage', () => {
  it('follows when music moves from the viewed page to the next', () => {
    const { rerender } = render(<FollowPlayingPage viewedPage={3} q="" />);
    player = { ...player, currentTrack: { id: 't2', page: 4 } };
    rerender(<FollowPlayingPage viewedPage={3} q="" />);
    expect(replace).toHaveBeenCalledWith('/feed?page=4');
  });

  it('does not move a viewer who is on another page', () => {
    const { rerender } = render(<FollowPlayingPage viewedPage={1} q="" />);
    player = { ...player, currentTrack: { id: 't2', page: 4 } };
    rerender(<FollowPlayingPage viewedPage={1} q="" />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not follow when the search differs', () => {
    const { rerender } = render(<FollowPlayingPage viewedPage={3} q="wav" />);
    player = { ...player, currentTrack: { id: 't2', page: 4 } };
    rerender(<FollowPlayingPage viewedPage={3} q="wav" />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('waits until the page is visible, then jumps to the latest playing page', () => {
    setHidden(true);
    const { rerender } = render(<FollowPlayingPage viewedPage={3} q="" />);
    player = { ...player, currentTrack: { id: 't2', page: 4 } };
    rerender(<FollowPlayingPage viewedPage={3} q="" />);
    player = { ...player, currentTrack: { id: 't3', page: 5 } };
    rerender(<FollowPlayingPage viewedPage={3} q="" />);
    expect(replace).not.toHaveBeenCalled();

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(replace).toHaveBeenCalledWith('/feed?page=5');
  });
});
