/* ============================================
   Theme Provider
   Applies theme, accent, glass settings
   ============================================ */

'use client';

import { getCloudToken, hasCloudBackend, loadCloudSettings, loadCloudWatchlist } from '@/lib/cloudSync';
import { toast } from '@/components/ui/Toaster';
import { useAuthStore } from '@/stores/auth';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/stores/settings';
import { useWatchlistStore } from '@/stores/watchlist';
import { useBlockedContentStore } from '@/stores/blockedContent';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, accentColor, customAccentHex, glassEffect } = useSettingsStore((s) => s.settings);
  const setAllSettings = useSettingsStore((s) => s.setAllSettings);
  const setItems = useWatchlistStore((s) => s.setItems);
  const fetchBlockedItems = useBlockedContentStore((s) => s.fetchBlockedItems);
  const { user, isLoggedIn, hydrateBackendSession } = useAuthStore();
  const pathname = usePathname();
  const lastToastAtRef = useRef(0);

  const normalizeHex = (value: string): string | null => {
    const raw = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const chars = raw.slice(1).split('');
      return `#${chars.map((char) => `${char}${char}`).join('')}`.toLowerCase();
    }
    return null;
  };

  const hexToRgb = (hex: string): [number, number, number] => {
    const value = hex.replace('#', '');
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ];
  };

  const mixWithWhite = ([red, green, blue]: [number, number, number], amount: number): [number, number, number] => {
    const clamp = Math.max(0, Math.min(1, amount));
    return [
      Math.round(red + (255 - red) * clamp),
      Math.round(green + (255 - green) * clamp),
      Math.round(blue + (255 - blue) * clamp),
    ];
  };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-accent', accentColor);
    root.setAttribute('data-glass', glassEffect ? 'on' : 'off');

    if (accentColor === 'custom') {
      const normalized = normalizeHex(customAccentHex) || '#6366f1';
      const rgb = hexToRgb(normalized);
      const hover = mixWithWhite(rgb, 0.16);

      root.style.setProperty('--accent', normalized);
      root.style.setProperty('--accent-hover', `rgb(${hover[0]}, ${hover[1]}, ${hover[2]})`);
      root.style.setProperty('--accent-muted', `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.2)`);
      root.style.setProperty('--accent-glow', `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.45)`);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--accent-muted');
      root.style.removeProperty('--accent-glow');
    }

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme, accentColor, customAccentHex, glassEffect]);

  useEffect(() => {
    fetchBlockedItems();
  }, [fetchBlockedItems]);

  useEffect(() => {
    if (!hasCloudBackend()) return;
    if (!getCloudToken()) return;

    let cancelled = false;
    (async () => {
      try {
        await hydrateBackendSession();
        if (!getCloudToken()) return;
        const [settingsRes, watchlistRes] = await Promise.all([
          loadCloudSettings(),
          loadCloudWatchlist(),
        ]);

        if (cancelled) return;
        if (settingsRes?.settings && typeof settingsRes.settings === 'object') {
          setAllSettings({ ...DEFAULT_SETTINGS, ...(settingsRes.settings as any) } as any);
        }
        if (Array.isArray(watchlistRes?.items)) {
          setItems(watchlistRes.items as any);
        }
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setAllSettings, setItems, hydrateBackendSession]);

  useEffect(() => {
    if (isLoggedIn && user?.requiresPasswordChange && pathname !== '/settings') {
      const now = Date.now();
      // Show every 30s if still not changed
      if (now - lastToastAtRef.current > 30000) {
        toast('Action Required: Please change your temporary password in Settings.', 'warning');
        lastToastAtRef.current = now;
      }
    }
  }, [isLoggedIn, user?.requiresPasswordChange, pathname]);

  return <>{children}</>;
}
