"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { getTrackStreamUrl, type UrlResult } from "@/lib/storage/actions";
import { continueAfterRelease, loadFeedPage, type QueuePage } from "@/lib/feed/actions";
import {
  EMPTY_QUEUE,
  advance,
  appendPage,
  back,
  canExtend,
  isFinishedSearch,
  startQueue,
  type PlayerTrack,
  type QueueSource,
  type QueueState,
} from "./queue";
import { useMediaSession } from "./useMediaSession";
import { AudioMeterContext, AudioWaveformContext, useAudioMeterSource } from './audioMeter';
import { usePeakReaders, usePeaks } from './peaks';

export { toPlayerTrack, type PlayerTrack, type QueueSource } from "./queue";

type Status = "idle" | "loading" | "playing" | "error";
type ExtendResult = "added" | "end" | "error";

// Stream URLs are signed for 2 h (STREAM_TTL_SECONDS). A pre-signed URL older
// than this is signed again so it can't expire partway through the track.
export const PRESIGN_MAX_AGE_MS = 60 * 60 * 1000;

// How many pages goNext fetches looking for a new track before it gives up.
const MAX_EXTEND_ATTEMPTS = 3;

type Presigned = { trackId: string; url: string; at: number };

function freshUrl(p: Presigned | null, trackId: string): string | null {
  return p && p.trackId === trackId && Date.now() - p.at < PRESIGN_MAX_AGE_MS ? p.url : null;
}

const NO_SOURCE: QueueSource = { kind: "none" };

type PlayerContextValue = {
  queue: PlayerTrack[];
  currentIndex: number;
  currentTrack: PlayerTrack | null;
  source: QueueSource;
  isPlaying: boolean;
  status: Status;
  playQueue: (tracks: PlayerTrack[], startIndex?: number, source?: QueueSource) => void;
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

// Position/duration tick ~4x/s during playback, so they live in their own
// context: only the scrubber (PlayerBar) re-renders on each tick, not every
// play button on the page.
type PlayerTimeValue = { currentTime: number; duration: number };
const PlayerTimeContext = createContext<PlayerTimeValue | null>(null);

export function usePlayerTime(): PlayerTimeValue {
  const ctx = useContext(PlayerTimeContext);
  if (!ctx) throw new Error("usePlayerTime must be used within a PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Desktop: live Web Audio analyser, which needs CORS-mode media. Touch
  // devices load the element plainly so iOS keeps playing in the background,
  // and draw from stored peaks instead (below).
  const live = useAudioMeterSource(audioRef);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (live.supported) audio.crossOrigin = 'anonymous';
    else audio.removeAttribute('crossorigin');
  }, [live.supported]);
  const [queueState, setQueueState] = useState<QueueState>(EMPTY_QUEUE);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<Status>("idle");

  // Event handlers and async callbacks read the queue from this ref so they
  // always see the latest state, not the render they were created in.
  const queueRef = useRef<QueueState>(EMPTY_QUEUE);
  // Bumped by every playQueue. Async results from an older queue are dropped.
  const genRef = useRef(0);
  // One in-flight next-page request at a time; concurrent callers share it.
  const extendingRef = useRef<Promise<ExtendResult> | null>(null);
  const presignedRef = useRef<Presigned | null>(null);
  // A track already started by moveTo (src set + play() called), so the load
  // effect must not load it a second time.
  const startedRef = useRef<string | null>(null);
  // Background prefetches fired for the current queue length. A page that adds
  // nothing leaves the length unchanged, so this caps empty-page loops.
  const prefetchRef = useRef({ length: -1, attempts: 0 });

  const currentTrack = queueState.tracks[queueState.index] ?? null;
  const nextTrack = queueState.tracks[queueState.index + 1] ?? null;
  // Touch devices draw from the track's stored loudness (desktop never fetches
  // it). The peaks request waits until audio has started for this track: Next
  // runs client server actions one at a time, so asking earlier would queue it
  // ahead of getTrackStreamUrl and delay playback by a round trip.
  const [audioStartedId, setAudioStartedId] = useState<string | null>(null);
  const peakTrackId =
    !live.supported && audioStartedId !== null && audioStartedId === currentTrack?.id ? audioStartedId : undefined;
  const peakReaders = usePeakReaders(audioRef, usePeaks(peakTrackId));
  const readLevel = live.supported ? live.readLevel : peakReaders.readLevel;
  const readWaveform = live.supported ? live.readWaveform : peakReaders.readWaveform;
  const enableMeter = live.enable;

  // Point the single <audio> element at a signed URL and start it. `isCurrent`
  // says whether the result still belongs to the track the player is on.
  const startAudio = useCallback((url: string, isCurrent: () => boolean, trackId: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = url;
    setAudioStartedId(trackId);
    void audio
      .play()
      .then(() => {
        if (isCurrent()) setStatus("playing");
      })
      .catch(() => {
        // Autoplay blocked or interrupted: land in a ready-but-paused state,
        // not stuck on "loading". User can press play.
        if (isCurrent()) {
          setStatus("idle");
          setIsPlaying(false);
        }
      });
  }, []);

  const commit = useCallback((s: QueueState) => {
    queueRef.current = s;
    setQueueState(s);
  }, []);

  // Move to `s`. If the new track's URL is already signed, start it right here,
  // inside the 'ended' (or click) handler: on a locked iPhone that keeps the gap
  // between one track ending and the next playing free of network calls.
  const moveTo = useCallback(
    (s: QueueState) => {
      const track = s.tracks[s.index];
      const url = track ? freshUrl(presignedRef.current, track.id) : null;
      if (audioRef.current && track && url) {
        startedRef.current = track.id;
        setStatus("loading");
        setCurrentTime(0);
        setDuration(0);
        const gen = genRef.current;
        startAudio(
          url,
          () => gen === genRef.current && queueRef.current.tracks[queueRef.current.index]?.id === track.id,
          track.id,
        );
      }
      commit(s);
    },
    [commit, startAudio],
  );

  // Fetch the next page and append it. An album-page queue, or a search queue
  // with no more pages, continues instead into the main feed after its last
  // release; from then on the queue's source is the plain feed (q "").
  const extend = useCallback((): Promise<ExtendResult> => {
    if (extendingRef.current) return extendingRef.current;
    const { source, tracks } = queueRef.current;
    let request: Promise<QueuePage>;
    // The search the result belongs to; a continuation is always the plain feed.
    let q: string | undefined;
    if (source.kind === "feed" && source.hasMore) {
      const { lastPage } = source;
      q = source.q;
      // Called inside .then so a synchronous throw also becomes a rejection.
      request = Promise.resolve().then(() => loadFeedPage({ q: source.q, page: lastPage + 1 }));
    } else if (isFinishedSearch(source)) {
      const from = tracks[tracks.length - 1]?.from;
      if (!from) return Promise.resolve("end");
      q = "";
      request = Promise.resolve().then(() => continueAfterRelease(from));
    } else if (source.kind === "album") {
      const { albumId } = source;
      q = "";
      request = Promise.resolve().then(() => continueAfterRelease({ kind: "album", albumId }));
    } else {
      return Promise.resolve("end");
    }
    const gen = genRef.current;
    const pending: Promise<ExtendResult> = request
      .then((res): ExtendResult => {
        if (gen !== genRef.current) return "end";
        if (res.error) return "error";
        const before = queueRef.current.tracks.length;
        commit(appendPage(queueRef.current, res.tracks, res.page, res.hasMore, q));
        return queueRef.current.tracks.length > before ? "added" : "end";
      })
      .catch((): ExtendResult => "error")
      .finally(() => {
        if (extendingRef.current === pending) extendingRef.current = null;
      });
    extendingRef.current = pending;
    return pending;
  }, [commit]);

  const goNext = useCallback(
    async (fromEnded: boolean) => {
      const step = advance(queueRef.current);
      if (step.kind === "moved") return moveTo(step.state);
      if (step.kind === "needsMore") {
        const gen = genRef.current;
        const from = queueRef.current.index;
        // A page can add nothing new (all duplicates or dropped rows) while
        // more pages remain, so fetch again — a bounded number of times.
        for (let attempt = 0; attempt < MAX_EXTEND_ATTEMPTS; attempt++) {
          const result = await extend();
          // A new queue started, or the player already moved on, while waiting.
          if (gen !== genRef.current || queueRef.current.index !== from) return;
          if (result === "error") {
            setStatus("error");
            setIsPlaying(false);
            return;
          }
          const after = advance(queueRef.current);
          if (after.kind === "moved") return moveTo(after.state);
          if (after.kind === "end") break;
        }
      }
      // Nothing after this track: stop.
      if (fromEnded) setIsPlaying(false);
    },
    [extend, moveTo],
  );

  const next = useCallback(() => {
    void goNext(false);
  }, [goNext]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    // Restart the current track if we're more than 3s in; otherwise go back.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const s = back(queueRef.current);
    if (s !== queueRef.current) moveTo(s);
  }, [moveTo]);

  const playQueue = useCallback(
    (tracks: PlayerTrack[], startIndex = 0, source: QueueSource = NO_SOURCE) => {
      enableMeter();
      genRef.current += 1;
      extendingRef.current = null;
      startedRef.current = null;
      prefetchRef.current = { length: -1, attempts: 0 };
      commit(startQueue(tracks, startIndex, source));
    },
    [commit, enableMeter],
  );

  const play = useCallback(() => {
    enableMeter();
    const audio = audioRef.current;
    // No-op while errored: there is no valid loaded track to play, and the
    // element's src has been cleared, so play must not resume stale audio.
    if (!audio || !currentTrack || status === "error") return;
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
  }, [currentTrack, status, enableMeter]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play();
    else pause();
  }, [play, pause]);

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
      void goNext(true);
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
  }, [goNext]);

  // Load + play whenever the selected track changes (unless moveTo already did).
  useEffect(() => {
    if (!currentTrack) return;
    // Always consume the marker: if moveTo's track was superseded before this
    // effect ran, a stale marker must not make a later load of it get skipped.
    const alreadyStarted = startedRef.current === currentTrack.id;
    startedRef.current = null;
    if (alreadyStarted) return;
    let cancelled = false;
    setStatus("loading");
    setCurrentTime(0);
    setDuration(0);
    audioRef.current?.pause();
    const pre = freshUrl(presignedRef.current, currentTrack.id);
    const urlResult: Promise<UrlResult> = pre
      ? Promise.resolve({ url: pre, error: null })
      : getTrackStreamUrl(currentTrack.id);
    // A rejected call (network loss, stale server-action id) is handled exactly
    // like an { url: null, error } result.
    urlResult
      .catch((): UrlResult => ({ url: null, error: "Could not load track." }))
      .then((res) => {
        if (cancelled) return;
        const audio = audioRef.current;
        if (!audio) return;
        if (res.error || !res.url) {
          // Clear the previously-loaded track so a later toggle()/play can't
          // resume the wrong audio under the failed track's title.
          audio.removeAttribute("src");
          audio.load();
          setStatus("error");
          setIsPlaying(false);
          return;
        }
        startAudio(res.url, () => !cancelled, currentTrack.id);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTrack, startAudio]);

  // Pre-sign the next track so 'ended' can start it without a server call.
  useEffect(() => {
    if (!nextTrack || freshUrl(presignedRef.current, nextTrack.id)) return;
    const gen = genRef.current;
    const id = nextTrack.id;
    getTrackStreamUrl(id)
      .then((res) => {
        // Only keep it if this track is still the next one: a late result for a
        // track the player already moved onto must not replace the new next URL.
        const { tracks, index } = queueRef.current;
        if (gen === genRef.current && res.url && tracks[index + 1]?.id === id) {
          presignedRef.current = { trackId: id, url: res.url, at: Date.now() };
        }
      })
      .catch(() => {});
  }, [nextTrack]);

  // Prefetch: when the last loaded track starts, fetch what comes after it now,
  // not when it ends (a locked phone may not get the chance then).
  useEffect(() => {
    const { tracks, index, source } = queueState;
    const pf = prefetchRef.current;
    if (pf.length !== tracks.length) prefetchRef.current = { length: tracks.length, attempts: 0 };
    if (tracks.length > 0 && index === tracks.length - 1 && canExtend(source)) {
      // Stop after MAX_EXTEND_ATTEMPTS fetches that added nothing; goNext can still fetch.
      if (prefetchRef.current.attempts >= MAX_EXTEND_ATTEMPTS) return;
      prefetchRef.current.attempts += 1;
      void extend();
    }
  }, [queueState, extend]);

  useMediaSession(audioRef, currentTrack, isPlaying, { play, pause, next, prev, seek });

  // Memoized so a time tick (which re-renders this provider) doesn't hand
  // every consumer a new object.
  const value = useMemo<PlayerContextValue>(
    () => ({
      queue: queueState.tracks,
      currentIndex: queueState.index,
      currentTrack,
      source: queueState.source,
      isPlaying,
      status,
      playQueue,
      toggle,
      next,
      prev,
      seek,
    }),
    [queueState, currentTrack, isPlaying, status, playQueue, toggle, next, prev, seek],
  );
  const time = useMemo<PlayerTimeValue>(() => ({ currentTime, duration }), [currentTime, duration]);

  return (
    <PlayerContext.Provider value={value}>
      <PlayerTimeContext.Provider value={time}>
        <AudioMeterContext.Provider value={readLevel}>
          <AudioWaveformContext.Provider value={readWaveform}>{children}</AudioWaveformContext.Provider>
        </AudioMeterContext.Provider>
      </PlayerTimeContext.Provider>
      {/* Single element for the whole app; hidden — controls live in PlayerBar. */}
      {/* crossOrigin is set in an effect, desktop only (see useAudioMeterSource):
          it lets Web Audio read the signal for the waveform/particles, and the R2
          buckets allow GET/HEAD from each site origin (infra/r2/) for that.
          Touch devices keep a plain element so playback survives backgrounding. */}
      <audio ref={audioRef} preload="metadata" />
    </PlayerContext.Provider>
  );
}
