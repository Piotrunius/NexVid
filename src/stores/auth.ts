/* ============================================
   Auth Store (Zustand)
   Local-first auth with optional backend sync
   ============================================ */

import { clearCloudToken, CloudApiError, getCloudApiUrl, getCloudToken, loadCloudMe, setCloudToken, updateCloudNickname } from '@/lib/cloudSync';
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
            playerVolume: 1,
            skipIntro: true,
            skipOutro: true,
            proxyUrl: '',
            febboxApiKey: '',
            introDbApiKey: '',
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
            playerVolume: 1,
            skipIntro: true,
            skipOutro: true,
            proxyUrl: '',
            febboxApiKey: '',
            introDbApiKey: '',
            preferredSources: [],
            disabledSources: [],
          },
        };
        set({ user, isLoggedIn: true, authToken: '' });
      },

      logout: () => {
        clearCloudToken();
        set({ user: null, isLoggedIn: false, authToken: '' });
      },

      loginWithBackend: async (username: string, password: string, turnstileToken?: string | null) => {
        set({ isLoading: true });
        try {
          const apiUrl = getCloudApiUrl();
          if (!apiUrl) throw new Error('Cloud API URL is not configured');
          const res = await fetch(`${apiUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, turnstileToken }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Login failed');
          setCloudToken(data.token || '');
          set({ user: data.user, isLoggedIn: true, isLoading: false, authToken: data.token || '' });
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
          const res = await fetch(`${apiUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, turnstileToken }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Registration failed');
          setCloudToken(data.token || '');
          set({ user: data.user, isLoggedIn: true, isLoading: false, authToken: data.token || '' });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      hydrateBackendSession: async () => {
        const token = getCloudToken();
        if (!token) return;

        try {
          const me = await loadCloudMe();
          if (me?.user) {
            set({ user: me.user, isLoggedIn: true, authToken: token });
          }
        } catch (error: any) {
          const status = error instanceof CloudApiError ? error.status : undefined;
          if (status === 401 || status === 403) {
            clearCloudToken();
            set({ authToken: '', user: null, isLoggedIn: false });
            return;
          }

          set((state: any) => ({
            authToken: token,
            user: state.user,
            isLoggedIn: Boolean(state.user),
          }));
        }
      },

      updateNicknameWithBackend: async (username: string) => {
        const result = await updateCloudNickname(username);
        set((state: any) => ({
          user: state.user ? { ...state.user, username: result?.user?.username || username } : state.user,
        }));
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
