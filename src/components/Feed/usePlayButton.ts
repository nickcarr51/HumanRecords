'use client';

import { usePlayer } from '@/components/Player';

// Shared play/pause behaviour for a feed button that covers one or more tracks
// (a single, an album, or one album track). If the current track is one of
// `trackIds`, the button reflects and controls that playback instead of
// starting over; otherwise it calls `start`.
export function usePlayButton(trackIds: string[], start: () => void) {
  const { currentTrack, isPlaying, status, toggle } = usePlayer();
  const active = currentTrack !== null && trackIds.includes(currentTrack.id);
  const loading = active && status === 'loading';
  const playing = active && (isPlaying || loading);

  function onClick() {
    if (!active || status === 'error') start(); // nothing of ours playing, or retry a failed load
    else if (!loading) toggle(); // pause, or resume where it left off
  }

  return { playing, onClick };
}
