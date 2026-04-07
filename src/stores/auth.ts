/* ============================================
   Auth Store (Zustand)
   Local-first auth with optional backend sync
   ============================================ */

import { updateCloudNickname as apiUpdateNickname, changeCloudPassword, clearCloudToken, CloudApiError, getCloudApiUrl, getCloudToken, loadCloudMe, logoutCloudSession, setCloudToken } from '@/lib/cloudSync';
import { generateId } from '@/lib/utils';
import type { User } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthStore {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  authToken: string;

  // Local auth (no backend needed)
  loginLocal: (username: string) => void;
  registerLocal: (username: string) => void;
  logout: () => void;

  // Backend auth (optional)
  loginWithBackend: (username: string, password: string, turnstileToken?: string | null) => Promise<void>;
  registerWithBackend: (username: string, password: string, turnstileToken?: string | null) => Promise<void>;
  hydrateBackendSession: () => Promise<void>;
  updateNicknameWithBackend: (username: string) => Promise<void>;
  changePasswordWithBackend: (currentPassword?: string, newPassword?: string) => Promise<void>;

  updateProfile: (partial: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      isLoading: false,
      authToken: '',

      loginLocal: (username: string) => {
        const user: User = {
          id: generateId(),
          username,
          createdAt: new Date().toISOString(),
          settings: {
            theme: 'dark',
            accentColor: 'indigo',
            customAccentHex: '#6366f1',
            glassEffect: true,
            language: 'en',
            subtitleLanguage: 'en',
            autoPlay: true,
            autoNext: true,
            defaultQuality: '1080',
            defaultSource: 'febbox',
            playerVolume: 1,
            skipIntro: true,
            skipOutro: true,
            autoSkipSegments: true,
            autoSwitchSource: true,
            idlePauseOverlay: true,
            febboxApiKey: '',
            disableEmbeds: false,
            introDbApiKey: '',
            groqApiKey: '',
            omdbApiKey: '',
            preferredSources: [],
            disabledSources: [],
          },
        };
        set({ user, isLoggedIn: true, authToken: '' });
      },

      registerLocal: (username: string) => {
        const user: User = {
          id: generateId(),
          username,
          createdAt: new Date().toISOString(),
          settings: {
            theme: 'dark',
            accentColor: 'indigo',
            customAccentHex: '#6366f1',
            glassEffect: true,
            language: 'en',
            subtitleLanguage: 'en',
            autoPlay: true,
            autoNext: true,
            defaultQuality: '1080',
            defaultSource: 'febbox',
            playerVolume: 1,
            skipIntro: true,
            skipOutro: true,
            autoSkipSegments: true,
            autoSwitchSource: true,
            idlePauseOverlay: true,
            febboxApiKey: '',
            disableEmbeds: false,
            introDbApiKey: '',
            groqApiKey: '',
            omdbApiKey: '',
            preferredSources: [],
            disabledSources: [],
          },
        };
        set({ user, isLoggedIn: true, authToken: '' });
      },

      logout: () => {
        void logoutCloudSession();
        clearCloudToken();
        set({ user: null, isLoggedIn: false, authToken: '' });
      },

      loginWithBackend: async (username: string, password: string, turnstileToken?: string | null) => {
        set({ isLoading: true });
        try {
          const apiUrl = getCloudApiUrl();
          if (!apiUrl) throw new Error('Cloud API URL is not configured');
          let res: Response;
          try {
            res = await fetch(`${apiUrl}/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password, turnstileToken }),
            });
          } catch {
            throw new CloudApiError('Network error while contacting cloud backend', 0, 'NETWORK_ERROR');
          }
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Login failed');
          setCloudToken(data.token || '');
          set({ user: data.user, isLoggedIn: true, isLoading: false, authToken: data.token || '' });

          // Trigger immediate data fetch after login/reg
          void (async () => {
            try {
              const { loadCloudSettings, loadCloudWatchlist } = await import('@/lib/cloudSync');
              const { useSettingsStore, DEFAULT_SETTINGS } = await import('@/stores/settings');
              const { useWatchlistStore } = await import('@/stores/watchlist');

              const [settingsRes, watchlistRes] = await Promise.all([
                loadCloudSettings(),
                loadCloudWatchlist(),
              ]);

              if (settingsRes?.settings) {
                useSettingsStore.getState().setAllSettings({ ...DEFAULT_SETTINGS, ...settingsRes.settings });
              }
              if (Array.isArray(watchlistRes?.items)) {
                useWatchlistStore.getState().setItems(watchlistRes.items);
              }
            } catch (e) {
              console.error('Failed to sync data:', e);
            }
          })();
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      registerWithBackend: async (username: string, password: string, turnstileToken?: string | null) => {
        set({ isLoading: true });
        try {
          const apiUrl = getCloudApiUrl();
          if (!apiUrl) throw new Error('Cloud API URL is not configured');
          let res: Response;
          try {
            res = await fetch(`${apiUrl}/auth/register`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password, turnstileToken }),
            });
          } catch {
            throw new CloudApiError('Network error while contacting cloud backend', 0, 'NETWORK_ERROR');
          }
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Registration failed');
          setCloudToken(data.token || '');
          set({ user: data.user, isLoggedIn: true, isLoading: false, authToken: data.token || '' });

          // Trigger immediate data fetch after login/reg
          void (async () => {
            try {
              const { loadCloudSettings, loadCloudWatchlist } = await import('@/lib/cloudSync');
              const { useSettingsStore, DEFAULT_SETTINGS } = await import('@/stores/settings');
              const { useWatchlistStore } = await import('@/stores/watchlist');

              const [settingsRes, watchlistRes] = await Promise.all([
                loadCloudSettings(),
                loadCloudWatchlist(),
              ]);

              if (settingsRes?.settings) {
                useSettingsStore.getState().setAllSettings({ ...DEFAULT_SETTINGS, ...settingsRes.settings });
              }
              if (Array.isArray(watchlistRes?.items)) {
                useWatchlistStore.getState().setItems(watchlistRes.items);
              }
            } catch (e) {
              console.error('Failed to sync data:', e);
            }
          })();
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      hydrateBackendSession: async () => {
        try {
          const me = await loadCloudMe();
          if (me?.user) {
            const token = getCloudToken();
            set({ user: me.user, isLoggedIn: true, authToken: token });
          }
        } catch (error: any) {
          const status = error instanceof CloudApiError ? error.status : undefined;
          if (status === 401 || status === 403) {
            clearCloudToken();
            set({ authToken: '', user: null, isLoggedIn: false });
            return;
          }

          const fallbackToken = getCloudToken();

          set((state: any) => ({
            authToken: fallbackToken,
            user: state.user,
            isLoggedIn: Boolean(state.user),
          }));
        }
      },

      updateNicknameWithBackend: async (username: string) => {
        set({ isLoading: true });
        try {
          await apiUpdateNickname(username);
          set((state: any) => ({
            user: state.user ? { ...state.user, username } : null,
            isLoading: false,
          }));
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      changePasswordWithBackend: async (currentPassword?: string, newPassword?: string) => {
        set({ isLoading: true });
        try {
          const result = await changeCloudPassword({ currentPassword, newPassword });
          if (result?.token) {
            setCloudToken(result.token);
          }
          set((state: any) => ({
            user: state.user ? { ...state.user, requiresPasswordChange: false } : null,
            authToken: result?.token || state.authToken,
            isLoading: false,
          }));
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      updateProfile: (partial: Partial<User>) =>
        set((state: any) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
    }),
    {
      name: 'nexvid-auth',
    }
  )
);
