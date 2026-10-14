import { createContext, useContext } from 'react';

// Per-frame readers for the visual effects, provided by PlayerProvider from the
// track's stored peaks (./peaks.ts). null = nothing to animate (idle dots).
export const AudioMeterContext = createContext<(() => number) | null>(null);
export const useAudioMeter = () => useContext(AudioMeterContext);
export const AudioWaveformContext = createContext<(() => Uint8Array<ArrayBuffer> | null) | null>(null);
export const useAudioWaveform = () => useContext(AudioWaveformContext);
