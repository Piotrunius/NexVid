const AUTH_TOKEN_KEY = 'nexvid-auth-token';
const DEVICE_ID_KEY = 'nexvid-device-id';
const DEFAULT_PROD_API_URL = 'https://nexvid-proxy.piotrunius.workers.dev';
const CLOUD_REQUEST_TIMEOUT_MS = 10000;

export class CloudApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'CloudApiError';
    this.status = status;
    this.code = code;
  }
}

function isLocalHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api/proxy';
  }

  const configured = (process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || '').replace(/\/+$/, '');

  if (configured) {
    try {
      const configuredUrl = new URL(configured);
      return configured;
    } catch {
      return configured;
    }
  }

  // Fallback for production server-side fetch
  return DEFAULT_PROD_API_URL;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = CLOUD_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const { signal } = init;

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => controller.abort(new Error(`Cloud API request timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      credentials: 'include',
    });
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

export function getCloudApiUrl(): string {
  return getApiUrl();
}

export function hasCloudBackend(): boolean {
  return Boolean(getApiUrl());
}

export function getCloudToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

export function setCloudToken(token: string) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function clearCloudToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getStableFingerprint(): string {
  if (typeof window === 'undefined') return '';
  try {
    const data = {
      id: getDeviceId(),
      ua: navigator.userAgent,
      scr: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: navigator.language,
      cores: navigator.hardwareConcurrency || 0,
    };
    return btoa(JSON.stringify(data));
  } catch {
    return '';
  }
}

export async function cloudFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error('Cloud API URL is not configured');

  const token = getCloudToken();
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const fingerprint = getStableFingerprint();
  if (fingerprint) {
    headers.set('NexVid-Fingerprint', fingerprint);
  }


  let response: Response;
  try {
    response = await fetchWithTimeout(`${apiUrl}${path}`, {
      ...init,
      headers,
    });

    // [MOD] Checking for seamless session migration (required for frontend to clear legacy token)
    if (typeof window !== 'undefined') {
      const migratedToken = response.headers.get('x-token-migrated');
      if (migratedToken) {
        setCloudToken(migratedToken);
      }
    }
  } catch {
    throw new CloudApiError('Network error while contacting cloud backend', 0, 'NETWORK_ERROR');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CloudApiError(data?.error || `Cloud API error (${response.status})`, response.status, 'HTTP_ERROR');
  }

  return data as T;
}

export async function logoutCloudSession() {
  try {
    await cloudFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' });
  } catch {
    // best effort logout
  }
}

export async function loadCloudMe() {
  return cloudFetch<{ user: any }>('/auth/me', { method: 'GET' });
}

export async function saveCloudSettings(settings: Record<string, unknown>) {
  return cloudFetch('/user/settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export async function loadCloudSettings() {
  return cloudFetch<{ settings: Record<string, unknown> }>('/user/settings', { method: 'GET' });
}

export async function saveCloudWatchlist(items: unknown[]) {
  return cloudFetch('/user/watchlist', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

export async function loadCloudWatchlist() {
  return cloudFetch<{ items: any[] }>('/user/watchlist', { method: 'GET' });
}

export async function changeCloudPassword(payload: { currentPassword?: string; newPassword?: string }) {
  return cloudFetch<{ ok: boolean; token?: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loadPublicAnnouncements() {
  try {
    return await cloudFetch<{ announcements: any[] }>('/public/announcements', {
      method: 'GET',
      cache: 'no-store',
      // @ts-ignore
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { announcements: [] as any[] };
  }
}

export async function loadAdminOverview() {
  return cloudFetch<{ stats: { users: number; activeSessions: number; activeWatchPartyRooms: number; activeAnnouncements: number; activeUsers: number; activeGuests: number }; admin: { id: string; username: string; role: string } }>('/admin/overview', { method: 'GET' });
}

export async function loadAdminBans() {
  return cloudFetch<{ items: { type: 'username' | 'ip'; value: string; reason?: string; created_at: string; userId?: string; linkedUserIds?: string[] }[] }>('/admin/bans', { method: 'GET' });
}

export async function loadAdminAccountLimits() {
  return cloudFetch<{ items: { type: 'username'; value: string; maxAccounts: number; createdAt: string; updatedAt: string }[] }>('/admin/account-limits', {
    method: 'GET',
  });
}

export async function setAdminAccountLimit(type: 'username', value: string, maxAccounts: number) {
  return cloudFetch('/admin/account-limits', {
    method: 'POST',
    body: JSON.stringify({ type, value, maxAccounts }),
  });
}

export async function deleteAdminAccountLimit(type: 'username', value: string) {
  return cloudFetch(`/admin/account-limits?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`, { method: 'DELETE' });
}

export async function lookupAdminAccounts(type: 'username', value: string) {
  return cloudFetch<{
    query: { type: 'username' | 'id'; value: string };
    accountCount: number;
    ipGroupCount?: number;
    deviceGroupCount?: number;
    inspectedIpGroupCount?: number;
    inspectedDeviceGroupCount?: number;
    ignoredSharedIpGroupCount?: number;
    ignoredSharedDeviceGroupCount?: number;
    accounts: { id: string; username: string; lastSeenAt?: string | null }[];
  }>(`/admin/account-lookup?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`, {
    method: 'GET',
  });
}

export async function banAdminTarget(type: 'username' | 'ip', value: string, reason: string) {
  return cloudFetch('/admin/bans', {
    method: 'POST',
    body: JSON.stringify({ type, value, reason }),
  });
}

export async function unbanAdminTarget(type: 'username' | 'ip', value: string) {
  const encodedType = encodeURIComponent(type);
  const encodedValue = encodeURIComponent(value);
  return cloudFetch(`/admin/bans?type=${encodedType}&value=${encodedValue}`, { method: 'DELETE' });
}

export async function loadAdminAnnouncements() {
  return cloudFetch<{ items: any[] }>('/admin/announcements', { method: 'GET' });
}

export async function loadAdminBlockedMedia() {
  return cloudFetch<{ items: { tmdbId: string; mediaType: string; reason: string | null; createdAt: string }[] }>('/admin/blocked-media', { method: 'GET' });
}

export async function addAdminBlockedMedia(tmdbId: string, mediaType: 'movie' | 'tv', reason?: string) {
  return cloudFetch('/admin/blocked-media', {
    method: 'POST',
    body: JSON.stringify({ tmdbId, mediaType, reason }),
  });
}

export async function deleteAdminBlockedMedia(tmdbId: string, mediaType: 'movie' | 'tv') {
  return cloudFetch(`/admin/blocked-media?tmdbId=${encodeURIComponent(tmdbId)}&mediaType=${encodeURIComponent(mediaType)}`, { method: 'DELETE' });
}

export async function loadPublicBlockedMedia() {
  return cloudFetch<{ items: { tmdbId: string; mediaType: string }[] }>('/public/blocked-media', {
    method: 'GET',
    cache: 'no-store'
  });
}

export async function createAdminAnnouncement(payload: {
  message: string;
  type: 'info' | 'warning' | 'update' | 'success';
  linkUrl?: string;
  linkLabel?: string;
  isActive?: boolean;
}) {
  return cloudFetch('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminAnnouncement(payload: {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'update' | 'success';
  linkUrl?: string;
  linkLabel?: string;
  isActive?: boolean;
}) {
  return cloudFetch('/admin/announcements', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminAnnouncement(id: string) {
  return cloudFetch(`/admin/announcements?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function deleteAdminUserByUsername(identifier: string) {
  return cloudFetch(`/admin/users?identifier=${encodeURIComponent(identifier)}`, { method: 'DELETE' });
}

export async function resetUserPassword(identifier: string) {
  return cloudFetch<{ ok: boolean; temporaryPassword?: string }>('/admin/users/reset-password', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });
}

export async function loadAdminUsers() {
  return cloudFetch<{ items: { id: string; username: string; createdAt: string; lastActiveAt: string }[] }>('/admin/users', { method: 'GET' });
}

export async function loadAdminGrantList() {
  return cloudFetch<{ items: { userId: string; username: string; role: string; grantedBy: string | null; expiresAt: string | null; createdAt: string }[] }>('/admin/grant', { method: 'GET' });
}

export async function grantAdminPermission(username: string, expiresInDays?: number, role?: string) {
  return cloudFetch<{ ok: boolean }>('/admin/grant', {
    method: 'POST',
    body: JSON.stringify({ username, expiresInDays: expiresInDays || undefined, role: role || 'moderator' }),
  });
}

export async function revokeAdminPermission(userId: string) {
  return cloudFetch<{ ok: boolean }>(`/admin/grant?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export async function clearAllActiveSessions() {
  return cloudFetch<{ ok: boolean; clearedCount: number }>('/admin/sessions/clear', { method: 'POST' });
}

export async function clearUserActiveSessions(identifier: string) {
  return cloudFetch<{ ok: boolean; clearedCount: number; user: { id: string; username: string } }>('/admin/sessions/clear-user', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });
}

export async function loadAdminAuditLogs(params?: { limit?: number; offset?: number }) {
  const limit = Math.max(1, Math.min(100, params?.limit ?? 20));
  const offset = Math.max(0, params?.offset ?? 0);
  return cloudFetch<{
    items: {
      id: string;
      adminUserId: string;
      adminUsername: string | null;
      action: string;
      targetType: string;
      targetId: string | null;
      meta: Record<string, unknown> | null;
      createdAt: string;
    }[];
    hasMore: boolean;
    nextOffset: number;
  }>(`/admin/audit-logs?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`, { method: 'GET' });
}

export async function updateCloudNickname(username: string) {
  return cloudFetch<{ ok: boolean; user: any }>('/user/profile', {
    method: 'PUT',
    body: JSON.stringify({ username }),
  });
}

export async function clearCloudEverything() {
  return cloudFetch<{ ok: boolean; deleted: { account: boolean; settings: boolean; watchlist: boolean; sessions: boolean } }>('/user/clear-everything', {
    method: 'DELETE',
  });
}

export async function reportPlayerError(mediaType: string, mediaId: string, code: string, message: string, isFebboxAuth: boolean, febboxToken?: string) {
  return { ok: true };
}

export async function reportPlayerSuccess(febboxToken?: string) {
  return { ok: true };
}

export async function loadAdminFebboxTokens() {
  return cloudFetch<{ items: { token: string; label: string; is_active: number; is_banned: number; usage_count: number; error_count: number; last_used_at: string | null; created_at: string }[] }>('/admin/febbox-tokens', { method: 'GET' });
}

export async function addAdminFebboxToken(token: string, label?: string) {
  return cloudFetch('/admin/febbox-tokens', {
    method: 'POST',
    body: JSON.stringify({ token, label }),
  });
}

export async function updateAdminFebboxToken(token: string, isActive?: boolean, isBanned?: boolean) {
  return cloudFetch('/admin/febbox-tokens', {
    method: 'PUT',
    body: JSON.stringify({ token, isActive, isBanned }),
  });
}

export async function deleteAdminFebboxToken(token: string) {
  return cloudFetch(`/admin/febbox-tokens?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
}

export async function loadUserFeedbackThreads() {
  return cloudFetch<{
    items: {
      id: string;
      category: 'bug' | 'feedback' | 'contact' | 'feature';
      subject: string;
      status: 'open' | 'answered' | 'closed';
      createdAt: string;
      updatedAt: string;
      lastReplyAt: string;
      hasAdminReply: boolean;
      closedExpiresAt?: string;
      closedRemainingMs?: number;
    }[];
  }>('/user/feedback', { method: 'GET' });
}

export async function createUserFeedbackThread(payload: {
  category: 'bug' | 'feedback' | 'contact' | 'feature';
  subject: string;
  message: string;
}, turnstileToken?: string | null) {
  return cloudFetch<{ ok: boolean; id: string }>('/user/feedback', {
    method: 'POST',
    body: JSON.stringify({ ...payload, turnstileToken }),
  });
}

export async function loadUserFeedbackMessages(threadId: string) {
  return cloudFetch<{
    thread?: { id: string; status: 'open' | 'answered' | 'closed'; closedExpiresAt?: string; closedRemainingMs?: number };
    items: { id: string; senderRole: 'user' | 'admin'; message: string; createdAt: string }[];
  }>(
    `/user/feedback/messages?threadId=${encodeURIComponent(threadId)}`,
    { method: 'GET' }
  );
}

export async function sendUserFeedbackMessage(threadId: string, message: string) {
  return cloudFetch<{ ok: boolean }>('/user/feedback/messages', {
    method: 'POST',
    body: JSON.stringify({ threadId, message }),
  });
}

export async function loadUserNotifications() {
  return cloudFetch<{
    items: {
      id: string;
      type: string;
      title: string;
      message: string;
      threadId?: string;
      isRead: boolean;
      createdAt: string;
    }[];
  }>('/user/notifications', { method: 'GET' });
}

export async function markUserNotificationsRead(ids: string[]) {
  return cloudFetch<{ ok: boolean; updatedAt: string }>('/user/notifications', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  });
}

export async function loadAdminFeedbackThreads() {
  return cloudFetch<{
    items: {
      id: string;
      userId: string;
      username: string;
      category: 'bug' | 'feedback' | 'contact' | 'feature';
      subject: string;
      status: 'open' | 'answered' | 'closed';
      createdAt: string;
      updatedAt: string;
      lastReplyAt: string;
      hasUnreadFromUser: boolean;
      closedExpiresAt?: string;
      closedRemainingMs?: number;
    }[];
  }>('/admin/feedback', { method: 'GET' });
}

export async function loadAdminFeedbackMessages(threadId: string) {
  return cloudFetch<{
    thread: { id: string; userId: string; status: 'open' | 'answered' | 'closed'; closedExpiresAt?: string; closedRemainingMs?: number };
    items: { id: string; senderUserId?: string; senderRole: 'user' | 'admin'; message: string; createdAt: string }[];
  }>(`/admin/feedback/messages?threadId=${encodeURIComponent(threadId)}`, { method: 'GET' });
}

export async function replyAdminFeedbackThread(payload: { threadId: string; message: string; status?: 'open' | 'answered' | 'closed' }) {
  return cloudFetch<{ ok: boolean }>('/admin/feedback/reply', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminFeedbackThread(threadId: string) {
  return cloudFetch<{ ok: boolean; deletedThreadId: string }>(`/admin/feedback/thread?threadId=${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
  });
}

export type WatchPartyRole = 'host' | 'guest';

export type WatchPartyPlaybackState = {
  paused: boolean;
  time: number;
  playbackRate: number;
  mediaKey: string;
  updatedAt: string;
};

export async function createWatchParty(payload: {
  mediaKey: string;
  mediaType?: string;
  mediaId?: string;
  season?: number;
  episode?: number;
  title?: string;
  name?: string;
  paused?: boolean;
  time?: number;
  playbackRate?: number;
}) {
  return cloudFetch<{
    ok: boolean;
    roomId: string;
    hostToken: string;
    participantId: string;
    role: WatchPartyRole;
    state: WatchPartyPlaybackState;
    serverNow: string;
    recommendedHostPushMs: number;
    recommendedGuestPollMs: number;
  }>('/watch-party/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function joinWatchParty(payload: {
  roomId: string;
  participantId?: string;
  mediaKey?: string;
  name?: string;
}) {
  return cloudFetch<{
    ok: boolean;
    roomId: string;
    participantId: string;
    role: WatchPartyRole;
    hostName: string;
    mediaKey: string;
    mediaType?: string;
    mediaId?: string;
    season?: number;
    episode?: number;
    title?: string;
    state: WatchPartyPlaybackState;
    updatedAt: string;
    serverNow: string;
    recommendedGuestPollMs: number;
  }>('/watch-party/join', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loadWatchPartyState(roomId: string, since?: string) {
  const qs = new URLSearchParams({ roomId });
  if (since) qs.set('since', since);
  return cloudFetch<{
    ok: boolean;
    changed: boolean;
    roomId: string;
    hostName?: string;
    mediaKey?: string;
    mediaType?: string;
    mediaId?: string;
    season?: number;
    episode?: number;
    title?: string;
    state?: WatchPartyPlaybackState;
    participantCount?: number;
    updatedAt: string;
    serverNow: string;
    recommendedGuestPollMs: number;
  }>(`/watch-party/state?${qs.toString()}`, { method: 'GET' });
}

export async function updateWatchPartyState(payload: {
  roomId: string;
  hostToken: string;
  paused: boolean;
  time: number;
  playbackRate: number;
  mediaKey: string;
}) {
  return cloudFetch<{ ok: boolean; updatedAt: string }>('/watch-party/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function leaveWatchParty(payload: { roomId: string; participantId: string }) {
  return cloudFetch<{ ok: boolean; roomClosed: boolean; participantCount?: number }>('/watch-party/leave', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
