"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getTrackStreamUrl } from "@/lib/storage/actions";

export type PlayerTrack = { id: string; title: string; artistName: string };

export function toPlayerTrack(t: {
  id: string;
  title: string;
  artistNames: string[];
}): PlayerTrack {
  return {
    id: t.id,
    title: t.title,
    artistName: t.artistNames.length ? t.artistNames.join(", ") : "Unknown Artist",
  };
}

type Status = "idle" | "loading" | "playing" | "error";

type PlayerContextValue = {
  queue: PlayerTrack[];
  currentIndex: number;
  currentTrack: PlayerTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  status: Status;
  playQueue: (tracks: PlayerTrack[], startIndex?: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<Status>("idle");

  const currentTrack = queue[currentIndex] ?? null;

  const next = useCallback(() => {
    setCurrentIndex((i) => (i < queue.length - 1 ? i + 1 : i));
  }, [queue.length]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    // Restart the current track if we're more than 3s in; otherwise go back.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    setCurrentIndex((i) => (i > 0 ? i - 1 : 0));
  }, []);

  const playQueue = useCallback((tracks: PlayerTrack[], startIndex = 0) => {
    setQueue(tracks);
    setCurrentIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [currentTrack]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  // Attach media element event listeners once.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => {
      setIsPlaying(true);
      setStatus("playing");
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      next();
    };
    const onError = () => {
      setStatus("error");
      setIsPlaying(false);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [next]);

  // Load + play whenever the selected track changes.
  useEffect(() => {
    if (!currentTrack) return;
    let cancelled = false;
    setStatus("loading");
    setCurrentTime(0);
    setDuration(0);
    audioRef.current?.pause();
    getTrackStreamUrl(currentTrack.id).then((res) => {
      if (cancelled) return;
      const audio = audioRef.current;
      if (!audio) return;
      if (res.error || !res.url) {
        setStatus("error");
        setIsPlaying(false);
        return;
      }
      audio.src = res.url;
      void audio
        .play()
        .then(() => {
          if (!cancelled) setStatus("playing");
        })
        .catch(() => {
          // Autoplay blocked or interrupted: land in a ready-but-paused state,
          // not stuck on "loading". User can press play.
          if (!cancelled) {
            setStatus("idle");
            setIsPlaying(false);
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  const value: PlayerContextValue = {
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    status,
    playQueue,
    toggle,
    next,
    prev,
    seek,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* Single element for the whole app; hidden — controls live in PlayerBar. */}
      <audio ref={audioRef} preload="metadata" />
    </PlayerContext.Provider>
  );
}
