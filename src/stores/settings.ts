/* ============================================
   Settings Store (Zustand)
   ============================================ */

import { getCloudToken, saveCloudSettings } from '@/lib/cloudSync';
import type { AccentColor, StreamQuality, UserSettings } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  accentColor: 'indigo',
  customAccentHex: '#6366f1',
  glassEffect: true,
  language: 'en',
  subtitleLanguage: 'en',
  autoPlay: true,
  autoNext: true,
  defaultQuality: '1080',
  playerVolume: 1,
  skipIntro: true,
  skipOutro: true,
  autoSkipSegments: false,
  idlePauseOverlay: true,
  proxyUrl: '',
  febboxApiKey: '',
  disableEmbeds: false,
  introDbApiKey: '',
  preferredSources: [],
  disabledSources: [],
};

interface SettingsStore {
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
  setAllSettings: (settings: UserSettings) => void;
  resetSettings: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setAccentColor: (color: AccentColor) => void;
  toggleGlass: () => void;
  setProxyUrl: (url: string) => void;
  setDefaultQuality: (quality: StreamQuality) => void;
  toggleSource: (sourceId: string) => void;
  reorderSources: (sourceIds: string[]) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_SETTINGS },

      updateSettings: (partial) =>
        set((state) => {
          const next = { ...state.settings, ...partial };
          if (getCloudToken()) {
            void saveCloudSettings(next as Record<string, unknown>).catch(() => {});
          }
          return { settings: next };
        }),

      setAllSettings: (settings) =>
        set((state) => ({
          settings: {
            ...DEFAULT_SETTINGS,
            ...state.settings,
            ...settings,
          },
        })),

      resetSettings: () => {
        const next = { ...DEFAULT_SETTINGS };
        if (getCloudToken()) {
          void saveCloudSettings(next as Record<string, unknown>).catch(() => {});
        }
        set({ settings: next });
      },

      setTheme: (theme) =>
        get().updateSettings({ theme }),

      setAccentColor: (accentColor) =>
        get().updateSettings({ accentColor }),

      toggleGlass: () =>
        get().updateSettings({ glassEffect: !get().settings.glassEffect }),

      setProxyUrl: (proxyUrl) =>
        get().updateSettings({ proxyUrl }),

      setDefaultQuality: (defaultQuality) =>
        get().updateSettings({ defaultQuality }),

      toggleSource: (sourceId) =>
        set((state) => {
          const disabled = [...state.settings.disabledSources];
          const idx = disabled.indexOf(sourceId);
          if (idx === -1) disabled.push(sourceId);
          else disabled.splice(idx, 1);
          if (getCloudToken()) {
            void saveCloudSettings({ ...state.settings, disabledSources: disabled } as Record<string, unknown>).catch(() => {});
          }
          return { settings: { ...state.settings, disabledSources: disabled } };
        }),

      reorderSources: (sourceIds) =>
        set((state) => {
          const next = { ...state.settings, preferredSources: sourceIds };
          if (getCloudToken()) {
            void saveCloudSettings(next as Record<string, unknown>).catch(() => {});
          }
          return { settings: next };
        }),
    }),
    {
      name: 'nexvid-settings',
    }
  )
);
