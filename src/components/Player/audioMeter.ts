import { createContext, useContext, useEffect, useRef, useCallback, useState, type RefObject } from 'react';

/**
 * Web Audio analysis is desktop-only. Routing the <audio> element through an
 * AudioContext (createMediaElementSource) makes iOS stop the sound as soon as
 * Safari is backgrounded, and Android is inconsistent and burns battery. A plain
 * media element keeps playing in the background, so phones/tablets skip the
 * analyser (and `crossOrigin`) entirely; the waveform shows its idle dots.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return coarse || iOS;
}

export const AudioMeterContext = createContext<(() => number) | null>(null);
export const useAudioMeter = () => useContext(AudioMeterContext);
export const AudioWaveformContext = createContext<(() => Uint8Array<ArrayBuffer> | null) | null>(null);
export const useAudioWaveform = () => useContext(AudioWaveformContext);

/** One analyser for the app's single audio element; no per-frame React updates. */
export function useAudioMeterSource(audioRef: RefObject<HTMLAudioElement | null>) {
  const meter = useRef<{ context: AudioContext; analyser: AnalyserNode; source: MediaElementAudioSourceNode; bytes: Uint8Array<ArrayBuffer> } | null>(null);
  const level = useRef(0);
  const lastRead = useRef(-Infinity);
  // Server: false. Client: decided once at mount; only feeds context values,
  // never markup, so there is no hydration mismatch.
  const [supported] = useState(() => !isTouchDevice());

  const enable = useCallback(() => {
    const audio = audioRef.current;
    if (!supported || !audio || audio.crossOrigin !== 'anonymous' || typeof AudioContext === 'undefined') return;
    try {
      if (!meter.current) {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        const source = context.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(context.destination);
        meter.current = { context, analyser, source, bytes: new Uint8Array(analyser.fftSize) };
      }
      void meter.current.context.resume().catch(() => {});
    } catch { /* Unsupported audio analysis must not crash the controls. */ }
  }, [audioRef, supported]);

  const readLevel = useCallback(() => {
    const m = meter.current;
    if (!m || m.context.state !== 'running' || audioRef.current?.paused) return 0;
    // Several buttons read per frame; smooth once per frame, not once per reader.
    const now = performance.now();
    if (now - lastRead.current < 8) return level.current;
    lastRead.current = now;
    m.analyser.getByteTimeDomainData(m.bytes);
    let sum = 0;
    for (const byte of m.bytes) sum += ((byte - 128) / 128) ** 2;
    const rms = Math.min(1, Math.sqrt(sum / m.bytes.length) * 4);
    level.current += (rms - level.current) * 0.25;
    return level.current;
  }, [audioRef]);

  const readWaveform = useCallback(() => {
    const m = meter.current;
    if (!m || m.context.state !== 'running' || audioRef.current?.paused) return null;
    m.analyser.getByteTimeDomainData(m.bytes);
    return m.bytes;
  }, [audioRef]);

  useEffect(() => () => {
    const m = meter.current;
    if (m) {
      m.source.disconnect();
      m.analyser.disconnect();
      void m.context.close().catch(() => {});
      meter.current = null;
    }
  }, []);

  return {
    supported,
    enable,
    // null on touch devices so consumers skip their draw loops entirely.
    readLevel: supported ? readLevel : null,
    readWaveform: supported ? readWaveform : null,
  };
}
