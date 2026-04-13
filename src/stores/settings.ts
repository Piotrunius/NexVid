/* ============================================
   Settings Store (Zustand)
   ============================================ */

import { getCloudToken, saveCloudSettings } from "@/lib/cloudSync";
import { PUBLIC_TIDB_API_KEY_PLACEHOLDER } from "@/lib/tidb";
import type { AccentColor, StreamQuality, UserSettings } from "@/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const PUBLIC_GROQ_API_KEY_PLACEHOLDER = "__PUBLIC_GROQ_KEY__";
export const PUBLIC_OMDB_API_KEY_PLACEHOLDER = "__PUBLIC_OMDB_KEY__";

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "dark",
  accentColor: "indigo",
  customAccentHex: "#6366f1",
  glassEffect: true,
  language: "en",
  subtitleLanguage: "en",
  autoPlay: true,
  autoNext: true,
  defaultQuality: "1080",
  defaultSource: "febbox",
  playerVolume: 1,
  skipIntro: true,
  skipOutro: true,
  autoSkipSegments: true,
  autoSwitchSource: true,
  idlePauseOverlay: true,
  febboxApiKey: "",
  enableUnsafeEmbeds: false,
  introDbApiKey: PUBLIC_TIDB_API_KEY_PLACEHOLDER,
  groqApiKey: PUBLIC_GROQ_API_KEY_PLACEHOLDER,
  omdbApiKey: PUBLIC_OMDB_API_KEY_PLACEHOLDER,
  preferredSources: [],
  disabledSources: [],
  playerViewMode: "original",
  playerFillWidth: false,
  playerFillHeight: false,
  animeAudioMode: "sub",
  preferNativeAnimeSkip: true,
};

const CLOUD_PERSISTED_KEYS = [
  "theme",
  "accentColor",
  "customAccentHex",
  "subtitleLanguage",
  "autoPlay",
  "autoNext",
  "defaultQuality",
  "defaultSource",
  "playerVolume",
  "skipIntro",
  "skipOutro",
  "autoSkipSegments",
  "autoSwitchSource",
  "idlePauseOverlay",
  "febboxApiKey",
  "enableUnsafeEmbeds",
  "introDbApiKey",
  "groqApiKey",
  "omdbApiKey",
  "playerViewMode",
  "playerFillWidth",
  "playerFillHeight",
  "animeAudioMode",
  "preferNativeAnimeSkip",
] as const;

function toCloudPersistedSettings(
  settings: UserSettings,
): Record<string, unknown> {
  return Object.fromEntries(
    CLOUD_PERSISTED_KEYS.map((key) => [key, settings[key]]),
  );
}

interface SettingsStore {
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
  setAllSettings: (settings: UserSettings) => void;
  resetSettings: () => void;
  setTheme: (theme: "dark" | "light") => void;
  setAccentColor: (color: AccentColor) => void;
  toggleGlass: () => void;
  setDefaultQuality: (quality: StreamQuality) => void;
  setDefaultSource: (sourceId: string) => void;
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
            void saveCloudSettings(toCloudPersistedSettings(next)).catch(
              () => {},
            );
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
        const current = get().settings;
        const next = {
          ...DEFAULT_SETTINGS,
          accentColor: current.accentColor,
          customAccentHex: current.customAccentHex,
        };
        if (getCloudToken()) {
          void saveCloudSettings(toCloudPersistedSettings(next)).catch(
            () => {},
          );
        }
        set({ settings: next });
      },

      setTheme: (theme) => get().updateSettings({ theme }),

      setAccentColor: (accentColor) => get().updateSettings({ accentColor }),

      toggleGlass: () =>
        get().updateSettings({ glassEffect: !get().settings.glassEffect }),

      setDefaultQuality: (defaultQuality) =>
        get().updateSettings({ defaultQuality }),

      setDefaultSource: (defaultSource) =>
        get().updateSettings({ defaultSource }),

      toggleSource: (sourceId) =>
        set((state) => {
          const disabled = [...state.settings.disabledSources];
          const idx = disabled.indexOf(sourceId);
          if (idx === -1) disabled.push(sourceId);
          else disabled.splice(idx, 1);
          if (getCloudToken()) {
            void saveCloudSettings(
              toCloudPersistedSettings({
                ...state.settings,
                disabledSources: disabled,
              }),
            ).catch(() => {});
          }
          return { settings: { ...state.settings, disabledSources: disabled } };
        }),

      reorderSources: (sourceIds) =>
        set((state) => {
          const next = { ...state.settings, preferredSources: sourceIds };
          if (getCloudToken()) {
            void saveCloudSettings(toCloudPersistedSettings(next)).catch(
              () => {},
            );
          }
          return { settings: next };
        }),
    }),
    {
      name: "nexvid-settings",
    },
  ),
);
