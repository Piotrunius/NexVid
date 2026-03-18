/* ============================================
   Settings Page – macOS System Settings
   ============================================ */

'use client';

import { toast } from '@/components/ui/Toaster';
import { clearCloudEverything, hasCloudBackend } from '@/lib/cloudSync';
import { normalizeFebboxTokenForStorage, PUBLIC_FEBBOX_TOKEN_PLACEHOLDER } from '@/lib/febbox';
import { isPublicTidbKey, PUBLIC_TIDB_API_KEY_PLACEHOLDER } from '@/lib/tidb';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useWatchlistStore } from '@/stores/watchlist';
import type { AccentColor } from '@/types';
import { useMemo, useState } from 'react';

export default function SettingsPage() {
  const store = useSettingsStore();
  const settings = store.settings;
  const publicTokenActive = settings.febboxApiKey === PUBLIC_FEBBOX_TOKEN_PLACEHOLDER;
  const { user, isLoggedIn, updateProfile, updateNicknameWithBackend, changePasswordWithBackend, logout } = useAuthStore();
  const { exportItems, importItems, clearAll } = useWatchlistStore();
  const [proxyTestStatus, setProxyTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
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

  const accentColors: { key: AccentColor; label: string; color: string }[] = [
    { key: 'indigo', label: 'Indigo', color: '#6366f1' },
    { key: 'violet', label: 'Violet', color: '#8b5cf6' },
    { key: 'rose', label: 'Rose', color: '#f43f5e' },
    { key: 'emerald', label: 'Emerald', color: '#10b981' },
    { key: 'amber', label: 'Amber', color: '#f59e0b' },
    { key: 'cyan', label: 'Cyan', color: '#06b6d4' },
    { key: 'custom', label: 'Custom', color: normalizedCustomAccentHex },
  ];

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

  const testProxy = async () => {
    if (!settings.proxyUrl) { toast('Please enter a proxy URL first', 'error'); return; }
    setProxyTestStatus('testing');
    try {
      const base = settings.proxyUrl.replace(/\/+$/, '');
      const res = await fetch(`/api/proxy-health?url=${encodeURIComponent(base)}`, { signal: AbortSignal.timeout(7000) });
      const body = await res.json().catch(() => ({} as any));
      if (res.ok && body?.ok) {
        setProxyTestStatus('ok');
        toast(`Proxy is reachable (${body.path})`, 'success');
      } else {
        setProxyTestStatus('error');
        toast(body?.error || 'Proxy check failed', 'error');
      }
    } catch {
      setProxyTestStatus('error');
      toast('Could not reach proxy', 'error');
    }
  };

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

  return (
    <div className="min-h-screen pt-24 pb-8 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Page header */}
        <div className="mb-2">
          <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Settings</h1>
          <p className="text-[13px] text-text-muted mt-1">Manage your preferences and account</p>
        </div>

        {/* ── Profile ── */}
        {isLoggedIn && (
          <SettingsCard title="Profile" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}>
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
        <SettingsCard title="Appearance" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}>
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

            <SettingsRow label="Visual Effects">
              <button
                type="button"
                role="switch"
                aria-checked={!settings.glassEffect}
                onClick={() => store.updateSettings({ glassEffect: !settings.glassEffect })}
                className="w-full flex items-center justify-between rounded-full bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.06]"
              >
                <div className="text-left">
                  <p className="text-[13px] font-medium text-text-primary">Disable transparency</p>
                  <p className="text-[11px] text-text-muted mt-0.5">Switches UI to a flatter, simpler style (less glass depth).</p>
                </div>
                <div className={cn('relative w-11 h-[24px] rounded-full transition-colors duration-200', !settings.glassEffect ? 'bg-accent' : 'bg-white/10')}>
                  <div className={cn('absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200', !settings.glassEffect ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
                </div>
              </button>
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
                  <p className="text-[13px] font-medium text-text-primary truncate">Disable external embeds</p>
                  <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2 sm:line-clamp-none">Blocks sources that use an external iframe. Only direct streams will be used.</p>
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
          </div>
        </SettingsCard>

        {/* ── API Keys ── */}
        <SettingsCard title="API Keys" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>}>
          <p className="text-[12px] text-text-muted mb-4">Keys are saved in your account when logged in.</p>
          <div className="space-y-4">
            <SettingsRow label="TheIntroDB">
              <p className="text-[11px] text-text-muted mb-1.5">
                Required to submit timestamps. Get your own at{' '}
                <a href="https://theintrodb.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">theintrodb.org</a>
              </p>
              <input
                type="password"
                value={isPublicTidbKey(settings.introDbApiKey) ? 'PUBLIC_KEY_ACTIVE' : settings.introDbApiKey || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  store.updateSettings({ introDbApiKey: val === 'PUBLIC_KEY_ACTIVE' ? PUBLIC_TIDB_API_KEY_PLACEHOLDER : val });
                }}
                placeholder={isPublicTidbKey(settings.introDbApiKey) ? 'Public key active (hidden)' : 'theintrodb:user_...'}
                className="input w-full"
                autoComplete="new-password"
              />
              <div className="mt-2 rounded-[10px] bg-[var(--bg-glass-light)] p-3 shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)]">
                <p className="text-[11px] text-text-muted leading-relaxed">Public TheIntroDB key is available only for signed-in users.</p>
                {isLoggedIn && !isPublicTidbKey(settings.introDbApiKey) && (
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
                {isLoggedIn && isPublicTidbKey(settings.introDbApiKey) && (
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
              <p className="text-[11px] text-text-muted mb-1.5">Set up your own FebBox UI token by pasting the full cookie string or just the ui token</p>
              <input
                type="password"
                value={publicTokenActive ? 'PUBLIC_TOKEN_ACTIVE' : settings.febboxApiKey || ''}
                onChange={(e) => store.updateSettings({ febboxApiKey: normalizeFebboxTokenForStorage(e.target.value) })}
                placeholder={publicTokenActive ? 'Public token active (hidden)' : 'ui=...'}
                className="input w-full"
                autoComplete="new-password"
              />
              <div className="mt-2 rounded-[10px] bg-[var(--bg-glass-light)] p-3 shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)]">
                <p className="text-[11px] text-text-muted">Public FebBox token is available only for signed-in users.</p>
                {isLoggedIn && !publicTokenActive ? (
                  <button
                    onClick={() => {
                      store.updateSettings({ febboxApiKey: PUBLIC_FEBBOX_TOKEN_PLACEHOLDER });
                      toast('Public FebBox token enabled (slow and potentially unstable)', 'info');
                    }}
                    className="btn-glass mt-2 w-full text-[12px]"
                  >
                    Use public FebBox token
                  </button>
                ) : isLoggedIn && publicTokenActive ? (
                  <button
                    onClick={() => { store.updateSettings({ febboxApiKey: '' }); toast('Public token cleared', 'info'); }}
                    className="btn-glass mt-2 w-full text-[12px]"
                  >
                    Clear public token
                  </button>
                ) : null}
              </div>

              <div className="mt-2 rounded-[10px] bg-[var(--bg-glass-light)] p-3 shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)]">
                <p className="text-[11px] font-medium text-text-secondary mb-1.5">How to get your own FebBox token</p>
                <ol className="list-decimal pl-4 space-y-1 text-[11px] text-text-muted leading-relaxed">
                  <li>Log in to <a href="https://www.febbox.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">febbox.com</a></li>
                  <li>Open DevTools → Application → Cookies → febbox.com</li>
                  <li>Copy the <span className="text-text-secondary font-medium">ui</span> cookie value</li>
                  <li>Paste it above – saves automatically</li>
                </ol>
              </div>
            </SettingsRow>
          </div>
        </SettingsCard>

        {/* ── Proxy ── */}
        <SettingsCard title="Proxy" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}>
          <p className="text-[12px] text-text-muted mb-3">Cloudflare Worker proxy for bypassing restrictions.</p>
          <div className="flex gap-2">
            <input
              type="url"
              value={settings.proxyUrl}
              onChange={(e) => store.updateSettings({ proxyUrl: e.target.value })}
              placeholder="https://your-proxy.workers.dev"
              className="input flex-1"
            />
            <button
              onClick={testProxy}
              disabled={proxyTestStatus === 'testing'}
              className={cn(
                'btn-glass whitespace-nowrap text-[13px]',
                proxyTestStatus === 'ok' && '!text-emerald-400',
                proxyTestStatus === 'error' && '!text-red-400',
              )}
            >
              {proxyTestStatus === 'testing' ? 'Testing...' : proxyTestStatus === 'ok' ? '✓ OK' : proxyTestStatus === 'error' ? '✗ Fail' : 'Test'}
            </button>
          </div>
        </SettingsCard>

        {/* ── Data ── */}
        <SettingsCard title="Data" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>}>
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
        <SettingsCard title="FAQ" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}>
          <div className="space-y-3 text-[12px] leading-relaxed">
            <div className="rounded-[10px] bg-[var(--bg-glass-light)] p-3">
              <p className="text-text-primary font-medium">Why should I use my own FebBox UI Cookie?</p>
              <p className="mt-1 text-text-muted">A personal cookie bypasses the slow and unstable public proxy, providing instant loading, better quality, and a much smoother experience.</p>
            </div>
            <div className="rounded-[10px] bg-[var(--bg-glass-light)] p-3">
              <p className="text-text-primary font-medium">What are Alternative Sources?</p>
              <p className="mt-1 text-text-muted">These are external players used as backups when the primary source is unavailable. Interaction is locked by default for your security.</p>
            </div>
            <div className="rounded-[10px] bg-[var(--bg-glass-light)] p-3">
              <p className="text-text-primary font-medium">Is my data synced?</p>
              <p className="mt-1 text-text-muted">If you are logged in, your settings, watchlist, and progress are securely synced to your account across all your devices.</p>
            </div>
            <div className="rounded-[10px] bg-[var(--bg-glass-light)] p-3">
              <p className="text-text-primary font-medium">How do I fix playback issues?</p>
              <p className="mt-1 text-text-muted">Try clearing your local data in the Data section above, or switch to an alternative source using the button in the player.</p>
            </div>
            <div className="rounded-[10px] bg-[var(--bg-glass-light)] p-3">
              <p className="text-text-primary font-medium">Why is there no author in the credits?</p>
              <p className="mt-1 text-text-muted">The author information is not included in the credits for privacy and legal reasons.</p>
            </div>
          </div>
        </SettingsCard>

      </div>
    </div>
  );
}

/* ──── Reusable Settings Components – macOS style ──── */

function SettingsCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5 glass-liquid">
      <div className="flex items-center gap-2.5 mb-4">
        {icon && <span className="text-accent">{icon}</span>}
        <h3 className="text-[15px] font-semibold text-text-primary">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-text-secondary mb-2">{label}</p>
      {children}
    </div>
  );
}
