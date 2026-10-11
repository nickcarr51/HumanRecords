'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/components/Player';
import { pageHref } from '@/components/Pagination/pageHref';

// When playback runs off the end of the page being viewed into the next one,
// move the view along with it. A viewer looking at any other page, or another
// search, is never moved. While the page is hidden (phone locked) the move
// waits until it is visible again, then goes to wherever the music got to.
export function FollowPlayingPage({ viewedPage, q }: { viewedPage: number; q: string }) {
  const router = useRouter();
  const { currentTrack, source } = usePlayer();
  const playingPage = currentTrack?.page;
  const playingQ = source.kind === 'feed' ? source.q : null;

  const prevPlaying = useRef(playingPage);
  // The page the view should be on: the viewed page, or further along if the
  // music moved on while the page was hidden.
  const target = useRef(viewedPage);

  useEffect(() => {
    target.current = viewedPage;
  }, [viewedPage]);

  useEffect(() => {
    const from = prevPlaying.current;
    prevPlaying.current = playingPage;
    if (from === undefined || playingPage === undefined || playingQ !== q) return;
    if (from !== target.current || playingPage !== from + 1) return;
    target.current = playingPage;
    if (!document.hidden) router.replace(pageHref('/feed', q, playingPage));
  }, [playingPage, playingQ, q, router]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && target.current !== viewedPage) {
        router.replace(pageHref('/feed', q, target.current));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [q, viewedPage, router]);

  return null;
}
