import { createContext, useContext, useEffect, useRef, useCallback, type RefObject } from 'react';

export const AudioMeterContext = createContext<(() => number) | null>(null);
export const useAudioMeter = () => useContext(AudioMeterContext);
export const AudioWaveformContext = createContext<(() => Uint8Array<ArrayBuffer> | null) | null>(null);
export const useAudioWaveform = () => useContext(AudioWaveformContext);

/** One analyser for the app's single audio element; no per-frame React updates. */
export function useAudioMeterSource(audioRef: RefObject<HTMLAudioElement | null>) {
  const meter = useRef<{ context: AudioContext; analyser: AnalyserNode; source: MediaElementAudioSourceNode; bytes: Uint8Array<ArrayBuffer> } | null>(null);
  const level = useRef(0);

  const enable = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.crossOrigin !== 'anonymous' || typeof AudioContext === 'undefined') return;
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
  }, [audioRef]);

  const readLevel = useCallback(() => {
    const m = meter.current;
    if (!m || m.context.state !== 'running' || audioRef.current?.paused) return 0;
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

  return { enable, readLevel, readWaveform };
}
