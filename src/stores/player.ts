/* ============================================
   Player Store (Zustand)
   ============================================ */

import type { AudioTrack, Caption, IntroOutro, Stream, StreamQuality } from '@/types';
import { create } from 'zustand';

interface PlayerStore {
  // Playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  isLoading: boolean;
  error: string | null;

  // Stream
  currentStream: Stream | null;
  currentQuality: StreamQuality;
  availableQualities: StreamQuality[];

  // Captions
  captions: Caption[];
  activeCaption: string | null;

  // Audio tracks
  audioTracks: AudioTrack[];
  activeAudioTrack: number | null;

  // Intro/Outro (TIDB)
  introOutro: IntroOutro | null;
  showSkipIntro: boolean;
  showSkipOutro: boolean;

  // Controls visibility
  controlsVisible: boolean;
  controlsTimeout: ReturnType<typeof setTimeout> | null;

  // Actions
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setBuffered: (buffered: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setFullscreen: (fs: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  setStream: (stream: Stream) => void;
  setQuality: (quality: StreamQuality) => void;

  setCaptions: (captions: Caption[]) => void;
  setActiveCaption: (id: string | null) => void;

  setAudioTracks: (tracks: AudioTrack[]) => void;
  setActiveAudioTrack: (id: number | null) => void;

  setIntroOutro: (data: IntroOutro | null) => void;
  setShowSkipIntro: (show: boolean) => void;
  setShowSkipOutro: (show: boolean) => void;

  showControls: () => void;
  hideControls: () => void;

  reset: () => void;
}

const initialState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  isMuted: false,
  isFullscreen: false,
  isLoading: false,
  error: null,
  currentStream: null,
  currentQuality: '1080' as StreamQuality,
  availableQualities: [] as StreamQuality[],
  captions: [] as Caption[],
  activeCaption: null,
  audioTracks: [] as AudioTrack[],
  activeAudioTrack: null as number | null,
  introOutro: null,
  showSkipIntro: false,
  showSkipOutro: false,
  controlsVisible: true,
  controlsTimeout: null,
};

export const usePlayerStore = create<PlayerStore>()((set, get) => ({
  ...initialState,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => {
    const state = get();
    const io = state.introOutro;
    let showSkipIntro = false;
    let showSkipOutro = false;

    const resolveEnd = (end: number | undefined) => {
      if (end === undefined) return undefined;
      if (end === 0 && state.duration > 0) return state.duration;
      return end;
    };

    if (io) {
      if (io.introStart !== undefined && io.introEnd !== undefined) {
        const introStart = Math.max(0, io.introStart);
        const introEnd = resolveEnd(io.introEnd);
        if (introEnd !== undefined && introEnd > introStart) {
          showSkipIntro = currentTime >= introStart && currentTime < introEnd;
        }
      }
      if (io.outroStart !== undefined && io.outroEnd !== undefined) {
        const outroStart = Math.max(0, io.outroStart);
        const outroEnd = resolveEnd(io.outroEnd);
        if (outroEnd !== undefined && outroEnd > outroStart) {
          showSkipOutro = currentTime >= outroStart && currentTime < outroEnd;
        }
      }
    }

    set({ currentTime, showSkipIntro, showSkipOutro });
  },
  setDuration: (duration) => set({ duration }),
  setBuffered: (buffered) => set({ buffered }),
  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setFullscreen: (isFullscreen) => set({ isFullscreen }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  setStream: (currentStream) => {
    const availableQualities: StreamQuality[] = [];
    if (currentStream.type === 'file') {
      Object.keys(currentStream.qualities).forEach((q) => {
        availableQualities.push(q as StreamQuality);
      });
    }
    set({ currentStream, availableQualities, isLoading: true, error: null });
  },

  setQuality: (currentQuality) => set({ currentQuality }),

  setCaptions: (captions) => set({ captions }),
  setActiveCaption: (activeCaption) => set({ activeCaption }),

  setAudioTracks: (audioTracks) => set({ audioTracks }),
  setActiveAudioTrack: (activeAudioTrack) => set({ activeAudioTrack }),

  setIntroOutro: (introOutro) => set({ introOutro }),
  setShowSkipIntro: (showSkipIntro) => set({ showSkipIntro }),
  setShowSkipOutro: (showSkipOutro) => set({ showSkipOutro }),

  showControls: () => {
    const state = get();
    if (state.controlsTimeout) clearTimeout(state.controlsTimeout);
    const timeout = setTimeout(() => set({ controlsVisible: false }), 3000);
    set({ controlsVisible: true, controlsTimeout: timeout });
  },
  hideControls: () => set({ controlsVisible: false }),

  reset: () => {
    const state = get();
    if (state.controlsTimeout) clearTimeout(state.controlsTimeout);
    set({ ...initialState });
  },
}));
