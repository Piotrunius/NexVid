/* ============================================
   Settings Page – macOS System Settings
   ============================================ */

'use client';

import { toast } from '@/components/ui/Toaster';
import { clearCloudEverything, hasCloudBackend } from '@/lib/cloudSync';
import { normalizeFebboxTokenForStorage } from '@/lib/febbox';
import { isPublicTidbKey, PUBLIC_TIDB_API_KEY_PLACEHOLDER } from '@/lib/tidb';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
import { Crown, Zap, Star, Sparkles, Rocket, Activity, Compass, Infinity as InfinityIcon, Server } from 'lucide-react';
import { PUBLIC_GROQ_API_KEY_PLACEHOLDER, PUBLIC_OMDB_API_KEY_PLACEHOLDER, useSettingsStore } from '@/stores/settings';
import { SOURCES } from '@/lib/providers';
import { useWatchlistStore } from '@/stores/watchlist';
import type { AccentColor } from '@/types';
import { useEffect, useMemo, useState } from 'react';

export default function SettingsPage() {
  const store = useSettingsStore();
  const settings = store.settings;
  const { user, isLoggedIn, updateProfile, updateNicknameWithBackend, changePasswordWithBackend, logout } = useAuthStore();
  const watchlistItems = useWatchlistStore((state) => state.items);
  const { exportItems, importItems, clearAll } = useWatchlistStore();
  const [newUsername, setNewUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const normalizedCustomAccentHex = useMemo(() => {
    const raw = String(settings.customAccentHex || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const chars = raw.slice(1).split('');
      return `#${chars.map((char) => `${char}${char}`).join('')}`.toLowerCase();
    }
    return '#6366f1';
  }, [settings.customAccentHex]);

  const isPublicGroqKeyRaw = settings.groqApiKey === PUBLIC_GROQ_API_KEY_PLACEHOLDER;
  const isPublicOmdbKeyRaw = settings.omdbApiKey === PUBLIC_OMDB_API_KEY_PLACEHOLDER;
  const isPublicTidbKeyRaw = isPublicTidbKey(settings.introDbApiKey);

  const isPublicGroqKey = isLoggedIn && isPublicGroqKeyRaw;
  const isPublicOmdbKey = isLoggedIn && isPublicOmdbKeyRaw;
  const isPublicTidbKeyActive = isLoggedIn && isPublicTidbKeyRaw;

  const groqInputValue = isLoggedIn ? (isPublicGroqKeyRaw ? 'PUBLIC_KEY_ACTIVE' : settings.groqApiKey || '') : (isPublicGroqKeyRaw ? '' : settings.groqApiKey || '');
  const omdbInputValue = isLoggedIn ? (isPublicOmdbKeyRaw ? 'PUBLIC_KEY_ACTIVE' : settings.omdbApiKey || '') : (isPublicOmdbKeyRaw ? '' : settings.omdbApiKey || '');
  const tidbInputValue = isLoggedIn ? (isPublicTidbKeyRaw ? 'PUBLIC_KEY_ACTIVE' : settings.introDbApiKey || '') : (isPublicTidbKeyRaw ? '' : settings.introDbApiKey || '');

  const groqPlaceholder = isLoggedIn && isPublicGroqKeyRaw ? 'Public key active (hidden)' : 'gsk_...';
  const omdbPlaceholder = isLoggedIn && isPublicOmdbKeyRaw ? 'Public key active (hidden)' : '8 digits, e.g. abcdef12';
  const tidbPlaceholder = isLoggedIn && isPublicTidbKeyRaw ? 'Public key active (hidden)' : 'theintrodb:user_...';

  const accentColors: { key: AccentColor; label: string; color: string }[] = [
    { key: 'indigo', label: 'indigo', color: '#6366f1' },
    { key: 'violet', label: 'violet', color: '#8b5cf6' },
    { key: 'rose', label: 'rose', color: '#f43f5e' },
    { key: 'emerald', label: 'emerald', color: '#10b981' },
    { key: 'amber', label: 'amber', color: '#f59e0b' },
    { key: 'cyan', label: 'cyan', color: '#06b6d4' },
    { key: 'sky', label: 'sky', color: '#0ea5e9' },
    { key: 'lime', label: 'lime', color: '#84cc16' },
    { key: 'orange', label: 'orange', color: '#f97316' },
    { key: 'fuchsia', label: 'fuchsia', color: '#d946ef' },
    { key: 'teal', label: 'teal', color: '#14b8a6' },
    { key: 'red', label: 'red', color: '#ef4444' },
    { key: 'custom', label: 'custom', color: normalizedCustomAccentHex },
  ];

  const accountCreatedDate = useMemo(() => {
    if (!user?.createdAt) return null;
    const parsed = new Date(user.createdAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }, [user?.createdAt]);

  const accountAgeDays = useMemo(() => {
    if (!accountCreatedDate) return 0;
    const diffMs = Date.now() - accountCreatedDate.getTime();
    return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }, [accountCreatedDate]);

  const profileStats = useMemo(() => {
    const myListItems = watchlistItems.filter((item) => item.status !== 'none' && !item.hidden).length;
    const completed = watchlistItems.filter((item) => item.status === 'Completed').length;
    const inProgress = watchlistItems.filter((item) => (item.progress?.percentage || 0) > 0 && (item.progress?.percentage || 0) < 95).length;

    return {
      myListItems,
      completed,
      inProgress,
    };
  }, [watchlistItems]);

  const accountCreatedLabel = accountCreatedDate
    ? accountCreatedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Unknown';

  useEffect(() => {
    const currentAccent = String(settings.accentColor || '');
    if (currentAccent === 'blue') {
      store.updateSettings({ accentColor: 'sky' });
    }
    if (currentAccent === 'pink') {
      store.updateSettings({ accentColor: 'rose' });
    }
  }, [settings.accentColor, store]);

  const subtitleLanguageOptions = [
    { value: 'off', label: 'Off' },
    { value: 'pl', label: 'Polski' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'it', label: 'Italiano' },
    { value: 'pt', label: 'Português' },
    { value: 'el', label: 'Ελληνικά' },
    { value: 'fa', label: 'فارسی' },
    { value: 'he', label: 'עברית' },
    { value: 'ru', label: 'Русский' },
    { value: 'uk', label: 'Українська' },
    { value: 'tr', label: 'Türkçe' },
  ];

  const handleExportWatchlist = () => {
    const data = exportItems();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexvid-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Watchlist exported!', 'success');
  };

  const handleImportWatchlist = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try { const text = await file.text(); importItems(JSON.parse(text)); toast('Watchlist imported!', 'success'); }
      catch { toast('Failed to import watchlist', 'error'); }
    };
    input.click();
  };

  const handlePasswordReset = async () => {
    if (!currentPassword || !newPassword) { toast('Fill in both password fields', 'error'); return; }
    if (newPassword.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }

    try {
      if (hasCloudBackend()) {
        await changePasswordWithBackend(currentPassword, newPassword);
      }
      setCurrentPassword('');
      setNewPassword('');
      toast('Password updated', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to update password', 'error');
    }
  };

  const handleNicknameChange = async () => {
    const candidate = newUsername.trim();
    if (!/^[a-zA-Z0-9._-]{2,24}$/.test(candidate)) { toast('Nickname must be 2-24 chars: letters, numbers, dot, underscore, dash', 'error'); return; }
    try {
      if (hasCloudBackend()) await updateNicknameWithBackend(candidate);
      else updateProfile?.({ username: candidate });
      setNewUsername('');
      toast('Nickname updated', 'success');
    } catch (error: any) { toast(error?.message || 'Could not update nickname', 'error'); }
  };

  const handleClearEverything = async () => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    let cloudError: string | null = null;
    try {
      if (hasCloudBackend()) {
        try { await clearCloudEverything(); } catch (error: any) { cloudError = error?.message || 'Cloud cleanup failed'; }
      }
      usePlayerStore.getState().reset();
      clearAll();
      store.resetSettings();
      logout();
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index); if (key?.startsWith('nexvid-')) keysToRemove.push(key); }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        const sessionKeysToRemove: string[] = [];
        for (let index = 0; index < sessionStorage.length; index += 1) { const key = sessionStorage.key(index); if (key?.startsWith('nexvid-')) sessionKeysToRemove.push(key); }
        sessionKeysToRemove.forEach((key) => sessionStorage.removeItem(key));
      }
      if (cloudError) toast(`Local data cleared. ${cloudError}`, 'info');
      else toast('All local and cloud data has been deleted', 'info');
      window.location.href = '/login';
    } catch (error: any) { toast(error?.message || 'Failed to clear all data', 'error'); }
  };

  const getSourceIcon = (sourceId?: string) => {
    switch (sourceId) {
      case 'febbox': return <Crown className="w-3.5 h-3.5" />;
      case 'pobreflix': return <Zap className="w-3.5 h-3.5" />;
      case 'vidking': return <Star className="w-3.5 h-3.5" />;
      case 'zxcstream': return <Sparkles className="w-3.5 h-3.5" />;
      case 'vidfast': return <Rocket className="w-3.5 h-3.5" />;
      case 'vidsync': return <Activity className="w-3.5 h-3.5" />;
      case 'videasy': return <Compass className="w-3.5 h-3.5" />;
      case 'vidlink': return <InfinityIcon className="w-3.5 h-3.5" />;
      default: return <Server className="w-3.5 h-3.5" />;
    }
  };

  const availableSources = useMemo(() => {
    return SOURCES.filter(s => {
      if (s.id === 'febbox' && !settings.febboxApiKey) return false;
      if (settings.disableEmbeds && s.type === 'embed' && !['vidking', 'zxcstream'].includes(s.id)) return false;
      return true;
    });
  }, [settings.febboxApiKey, settings.disableEmbeds]);

  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(80%_120%_at_50%_0%,rgba(255,255,255,0.09),transparent_72%)]" />
      <div className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        {/* Page header */}
        <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] sm:p-6">
          <h1 className="text-[30px] font-bold text-text-primary tracking-tight">Settings</h1>
          <p className="mt-1 text-[13px] text-text-muted">Manage your preferences and account</p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">

        {/* ── Profile ── */}
        {isLoggedIn && (
          <SettingsCard title="Profile" className="xl:col-span-4" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}>
            <div className="flex items-center gap-4 mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-hover text-lg font-bold text-white shadow-[0_2px_12px_var(--accent-glow)]">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-[15px] font-semibold text-text-primary">{user?.username}</p>
                <p className="text-[12px] text-text-muted">Logged in</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <ProfileStatTile label="Account age" value={`${accountAgeDays}d`} sub={`since ${accountCreatedLabel}`} />
                <ProfileStatTile label="On My List" value={String(profileStats.myListItems)} sub="active titles" />
                <ProfileStatTile label="Completed" value={String(profileStats.completed)} sub="finished" />
                <ProfileStatTile label="In progress" value={String(profileStats.inProgress)} sub="continue watching" />
              </div>

              <SettingsRow label="Change Nickname">
                <div className="flex gap-2">
                  <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="New nickname" className="input flex-1" />
                  <button onClick={handleNicknameChange} className="btn-glass whitespace-nowrap">Update</button>
                </div>
              </SettingsRow>
              <SettingsRow label="Change Password">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className="input flex-1" />
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="input flex-1" />
                  <button onClick={handlePasswordReset} className="btn-glass whitespace-nowrap">Reset</button>
                </div>
              </SettingsRow>
            </div>
          </SettingsCard>
        )}

        {/* ── Appearance ── */}
        <SettingsCard title="Appearance" className={cn('xl:col-span-8', !isLoggedIn && 'xl:col-span-12')} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}>
          <div className="space-y-5">
            <SettingsRow label="Accent Color">
              <div className="flex flex-wrap items-center gap-1.5">
                {accentColors.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => store.updateSettings({ accentColor: c.key })}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-200',
                      settings.accentColor === c.key
                        ? 'bg-accent/10 text-text-primary shadow-[0_0_0_1px_var(--accent-muted)]'
                        : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.06]',
                    )}
                  >
                    <div className="h-3 w-3 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]" style={{ backgroundColor: c.color }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </SettingsRow>


            <SettingsRow label="Streaming Sources">
              <button
                type="button"
                role="switch"
                aria-checked={settings.disableEmbeds}
                onClick={() => store.updateSettings({ disableEmbeds: !settings.disableEmbeds })}
                className="w-full flex items-center justify-between gap-4 rounded-full bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.06]"
              >
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text-primary truncate">Disable unsafe embeds</p>
                  <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2 sm:line-clamp-none">Blocks sources that are unsafe. Only safe embeds and direct streams will be available.</p>
                </div>
                <div className={cn('relative shrink-0 w-11 h-[24px] rounded-full transition-colors duration-200', settings.disableEmbeds ? 'bg-accent' : 'bg-white/10')}>
                  <div className={cn('absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200', settings.disableEmbeds ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
                </div>
              </button>
            </SettingsRow>

            {settings.accentColor === 'custom' && (
              <SettingsRow label="Custom Accent Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={normalizedCustomAccentHex}
                    onChange={(e) => store.updateSettings({ customAccentHex: e.target.value, accentColor: 'custom' })}
                    className="h-10 w-12 cursor-pointer rounded-[10px] border border-white/10 bg-transparent p-1"
                    aria-label="Custom accent color"
                  />
                  <input
                    type="text"
                    value={settings.customAccentHex || ''}
                    onChange={(e) => store.updateSettings({ customAccentHex: e.target.value, accentColor: 'custom' })}
                    placeholder="#6366f1"
                    className="input flex-1"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-text-muted">Use HEX format (e.g. #4f46e5).</p>
              </SettingsRow>
            )}

            <SettingsRow label="Subtitle Language">
              <select
                value={settings.subtitleLanguage || 'en'}
                onChange={(e) => store.updateSettings({ subtitleLanguage: e.target.value })}
                className="input w-full"
              >
                {subtitleLanguageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-text-muted">Default subtitle selection in player. Can be changed per video.</p>
            </SettingsRow>

            <SettingsRow label="Preferred Quality">
              <select
                value={settings.defaultQuality}
                onChange={(e) => store.updateSettings({ defaultQuality: e.target.value as any })}
                className="input w-full"
              >
                <option value="4k">4K</option>
                <option value="2k">2K</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
                <option value="360">360p</option>
              </select>
              <p className="mt-1.5 text-[11px] text-text-muted">Default video quality preference when multiple streams are available.</p>
            </SettingsRow>

            <SettingsRow label="Default Source">
              <select
                value={settings.defaultSource}
                onChange={(e) => store.updateSettings({ defaultSource: e.target.value })}
                className="input w-full"
              >
                {availableSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-text-muted">Pick the source that launches first. Dynamic filters applied based on your security settings and FebBox key.</p>
            </SettingsRow>
          </div>
        </SettingsCard>

        {/* ── API Keys ── */}
        <SettingsCard title="API Keys" className="xl:col-span-12" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>}>
          <p className="text-[12px] text-text-muted mb-4">Keys are saved in your account when logged in.</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SettingsRow label="Groq AI API Key">
              <p className="text-[11px] text-text-muted mb-1.5">
                Powers the AI Assistant. Get your own at{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.groq.com</a>
              </p>
              <input
                type="password"
                value={groqInputValue}
                onChange={(e) => {
                  const val = e.target.value;
                  store.updateSettings({ groqApiKey: val === 'PUBLIC_KEY_ACTIVE' ? PUBLIC_GROQ_API_KEY_PLACEHOLDER : val });
                }}
                placeholder={groqPlaceholder}
                className="input w-full"
                autoComplete="new-password"
              />
              <div className="mt-2 rounded-[10px] bg-[var(--bg-glass-light)] p-3 shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)]">
                <p className="text-[11px] text-text-muted leading-relaxed">Public Groq key is available only for signed-in users.</p>
                {isLoggedIn && settings.groqApiKey !== PUBLIC_GROQ_API_KEY_PLACEHOLDER && (
                  <button
                    onClick={() => {
                      store.updateSettings({ groqApiKey: PUBLIC_GROQ_API_KEY_PLACEHOLDER });
                      toast('Public Groq key enabled', 'info');
                    }}
                    className="btn-glass mt-2 w-full text-[12px]"
                  >
                    Use public Groq key
                  </button>
                )}
                {isLoggedIn && settings.groqApiKey === PUBLIC_GROQ_API_KEY_PLACEHOLDER && (
                  <button
                    onClick={() => { store.updateSettings({ groqApiKey: '' }); toast('Public key cleared', 'info'); }}
                    className="btn-glass mt-2 w-full text-[12px]"
                  >
                    Clear public key
                  </button>
                )}
              </div>
            </SettingsRow>

            <SettingsRow label="OMDb API Key">
              <p className="text-[11px] text-text-muted mb-1.5">
                Used for external ratings (IMDb, Rotten Tomatoes, Metacritic). Get your own at{' '}
                <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">omdbapi.com</a>
              </p>
              <input
                type="password"
                value={omdbInputValue}
                onChange={(e) => {
                  const val = e.target.value;
                  store.updateSettings({ omdbApiKey: val === 'PUBLIC_KEY_ACTIVE' ? PUBLIC_OMDB_API_KEY_PLACEHOLDER : val });
                }}
                placeholder={omdbPlaceholder}
                className="input w-full"
                autoComplete="new-password"
              />
              <div className="mt-2 rounded-[10px] bg-[var(--bg-glass-light)] p-3 shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)]">
                <p className="text-[11px] text-text-muted leading-relaxed">Public OMDb key is available only for signed-in users.</p>
                {isLoggedIn && settings.omdbApiKey !== PUBLIC_OMDB_API_KEY_PLACEHOLDER && (
                  <button
                    onClick={() => {
                      store.updateSettings({ omdbApiKey: PUBLIC_OMDB_API_KEY_PLACEHOLDER });
                      toast('Public OMDb key enabled', 'info');
                    }}
                    className="btn-glass mt-2 w-full text-[12px]"
                  >
                    Use public OMDb key
                  </button>
                )}
                {isLoggedIn && settings.omdbApiKey === PUBLIC_OMDB_API_KEY_PLACEHOLDER && (
                  <button
                    onClick={() => { store.updateSettings({ omdbApiKey: '' }); toast('Public key cleared', 'info'); }}
                    className="btn-glass mt-2 w-full text-[12px]"
                  >
                    Clear public key
                  </button>
                )}
              </div>
            </SettingsRow>

            <SettingsRow label="TheIntroDB">
              <p className="text-[11px] text-text-muted mb-1.5">
                Required to submit timestamps. Get your own at{' '}
                <a href="https://theintrodb.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">theintrodb.org</a>
              </p>
              <input
                type="password"
                value={tidbInputValue}
                onChange={(e) => {
                  const val = e.target.value;
                  store.updateSettings({ introDbApiKey: val === 'PUBLIC_KEY_ACTIVE' ? PUBLIC_TIDB_API_KEY_PLACEHOLDER : val });
                }}
                placeholder={tidbPlaceholder}
                className="input w-full"
                autoComplete="new-password"
              />
              <div className="mt-2 rounded-[10px] bg-[var(--bg-glass-light)] p-3 shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)]">
                <p className="text-[11px] text-text-muted leading-relaxed">Public TheIntroDB key is available only for signed-in users.</p>
                {isLoggedIn && !isPublicTidbKeyActive && (
                  <button
                    onClick={() => {
                      store.updateSettings({ introDbApiKey: PUBLIC_TIDB_API_KEY_PLACEHOLDER });
                      toast('Public TheIntroDB key enabled', 'info');
                    }}
                    className="btn-glass mt-2 w-full text-[12px]"
                  >
                    Use public TheIntroDB key
                  </button>
                )}
                {isLoggedIn && isPublicTidbKeyActive && (
                  <button
                    onClick={() => { store.updateSettings({ introDbApiKey: '' }); toast('Public key cleared', 'info'); }}
                    className="btn-glass mt-2 w-full text-[12px]"
                  >
                    Clear public key
                  </button>
                )}
              </div>
            </SettingsRow>

            <SettingsRow label="FebBox UI Token">
              <p className="text-[11px] text-text-muted mb-1.5">Set up your own FebBox UI token by pasting the full cookie string or just the ui token.</p>
              <input
                type="password"
                value={settings.febboxApiKey || ''}
                onChange={(e) => store.updateSettings({ febboxApiKey: normalizeFebboxTokenForStorage(e.target.value) })}
                placeholder="ui=..."
                className="input w-full"
                autoComplete="new-password"
              />
              <div className="mt-2 rounded-[10px] bg-[var(--bg-glass-light)] p-3 shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)]">
                <p className="text-[11px] font-medium text-text-secondary mb-1.5">How to get your own FebBox token (Chromium / firefox)</p>
                <ol className="list-decimal pl-4 space-y-1 text-[11px] text-text-muted leading-relaxed">
                  <li>Log in to <a href="https://www.febbox.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">febbox.com</a></li>
                  <li>Open DevTools (F12) → Application/Storage → Cookies → www.febbox.com</li>
                  <li>Copy the <span className="text-text-secondary font-medium">ui</span> cookie value</li>
                </ol>
              </div>
            </SettingsRow>
          </div>
        </SettingsCard>

        {/* ── Data ── */}
        <SettingsCard title="Data" className="xl:col-span-5" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
              <button
                onClick={handleExportWatchlist}
                className="btn-accent flex items-center justify-center gap-1.5 text-[13px] !shadow-[0_6px_16px_rgba(0,0,0,0.35)] hover:!shadow-[0_10px_22px_rgba(0,0,0,0.45)] py-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Watchlist
              </button>
              <button onClick={handleImportWatchlist} className="btn-glass flex items-center justify-center gap-1.5 text-[13px] py-2.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import Watchlist
              </button>
              <button
                onClick={() => { store.resetSettings(); toast('Settings reset to defaults', 'success'); }}
                className="btn-glass flex items-center justify-center gap-1.5 text-[13px] py-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                Reset Settings
              </button>
              <button
                onClick={handleClearEverything}
                className="flex items-center justify-center gap-1.5 rounded-[10px] bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-400 hover:bg-red-500/18 active:scale-[0.98] transition-all duration-200"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Clear Everything
              </button>
            </div>
          </div>
        </SettingsCard>

        {/* ── FAQ ── */}
        <SettingsCard title="FAQ" className="xl:col-span-7" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}>
          <div className="space-y-3 text-[12px] leading-relaxed">
            <div className="rounded-[10px] bg-[var(--bg-glass-light)] p-3">
              <p className="text-text-primary font-medium">Why should I use my own FebBox UI Cookie?</p>
              <p className="mt-1 text-text-muted">A personal cookie bypasses the slow and unstable public proxy, providing instant loading, better quality, and a much smoother experience.</p>
            </div>
            <div className="rounded-[10px] bg-[var(--bg-glass-light)] p-3">
              <p className="text-text-primary font-medium">Is my data synced?</p>
              <p className="mt-1 text-text-muted">If you are logged in, your settings, watchlist, and progress are securely synced to your account across all your devices.</p>
            </div>
            <div className="rounded-[10px] bg-[var(--bg-glass-light)] p-3">
              <p className="text-text-primary font-medium">Why is there no author in the credits?</p>
              <p className="mt-1 text-text-muted">The author information is not included in the credits for privacy and legal reasons.</p>
            </div>
          </div>
        </SettingsCard>

        </div>
      </div>
    </div>
  );
}

/* ──── Reusable Settings Components – macOS style ──── */

function SettingsCard({ title, icon, className, children }: { title: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('glass-card glass-liquid rounded-[24px] border border-white/10 p-4 sm:p-5 shadow-[0_12px_34px_rgba(0,0,0,0.35)]', className)}>
      <div className="mb-4 flex items-center gap-2.5">
        {icon && <span className="text-accent/90">{icon}</span>}
        <h3 className="text-[15px] font-semibold tracking-tight text-text-primary">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">{label}</p>
      {children}
    </div>
  );
}

function ProfileStatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-secondary">{label}</p>
      <p className="mt-1 text-[18px] font-bold leading-none text-text-primary">{value}</p>
      <p className="mt-1 text-[11px] text-text-muted">{sub}</p>
    </div>
  );
}
