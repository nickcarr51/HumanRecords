"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { PlayerTrack } from "./queue";

// Every track shows the label logo on the lock screen (no per-track art yet).
export const LOCK_SCREEN_ARTWORK: MediaImage[] = [
  { src: "/human_records_main_logo.png", sizes: "1440x1440", type: "image/png" },
];

type Handlers = {
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
};

function mediaSession(): MediaSession | null {
  return typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
}

// Lock-screen / notification controls. Every part is skipped where the
// browser has no Media Session (and in tests that don't stub it).
export function useMediaSession(
  audioRef: RefObject<HTMLAudioElement | null>,
  track: PlayerTrack | null,
  isPlaying: boolean,
  handlers: Handlers,
) {
  // Handlers are registered once; this ref keeps them pointing at the latest callbacks.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const ms = mediaSession();
    if (!ms) return;
    ms.metadata =
      track && typeof MediaMetadata !== "undefined"
        ? new MediaMetadata({ title: track.title, artist: track.artistName, artwork: LOCK_SCREEN_ARTWORK })
        : null;
  }, [track]);

  useEffect(() => {
    const ms = mediaSession();
    if (!ms) return;
    ms.playbackState = !track ? "none" : isPlaying ? "playing" : "paused";
  }, [track, isPlaying]);

  useEffect(() => {
    const ms = mediaSession();
    if (!ms) return;
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => handlersRef.current.play()],
      ["pause", () => handlersRef.current.pause()],
      ["previoustrack", () => handlersRef.current.prev()],
      ["nexttrack", () => handlersRef.current.next()],
      [
        "seekto",
        (details) => {
          if (details.seekTime != null) handlersRef.current.seek(details.seekTime);
        },
      ],
    ];
    for (const [action, handler] of actions) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // This browser doesn't support the action; the rest still work.
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          // Same as above.
        }
      }
    };
  }, []);

  // Keeps the lock-screen progress bar in step with the audio.
  useEffect(() => {
    const ms = mediaSession();
    const audio = audioRef.current;
    if (!ms || !audio || typeof ms.setPositionState !== "function") return;
    const update = () => {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      try {
        ms.setPositionState({
          duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(Math.max(audio.currentTime, 0), duration),
        });
      } catch {
        // Invalid state mid-load; the next event corrects it.
      }
    };
    const events = ["loadedmetadata", "play", "pause", "seeked", "ratechange"] as const;
    events.forEach((e) => audio.addEventListener(e, update));
    return () => events.forEach((e) => audio.removeEventListener(e, update));
  }, [audioRef]);
}
