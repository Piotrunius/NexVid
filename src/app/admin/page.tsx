'use client';

import { toast } from '@/components/ui/Toaster';
import {
    banAdminTarget,
    clearAllActiveSessions,
    createAdminAnnouncement,
    deleteAdminAccountLimit,
    deleteAdminAnnouncement,
    deleteAdminFeedbackThread,
    deleteAdminUserByUsername,
    grantAdminPermission,
    loadAdminAccountLimits,
    loadAdminAnnouncements,
    loadAdminAuditLogs,
    loadAdminBans,
    loadAdminFeedbackMessages,
    loadAdminFeedbackThreads,
    loadAdminGrantList,
    loadAdminOverview,
    loadAdminUsers,
    lookupAdminAccounts,
    replyAdminFeedbackThread,
    revokeAdminPermission,
    setAdminAccountLimit,
    unbanAdminTarget,
    updateAdminAnnouncement,
} from '@/lib/cloudSync';
import { useAuthStore } from '@/stores/auth';
import { useEffect, useMemo, useState } from 'react';

type AnnouncementType = 'info' | 'warning' | 'update' | 'success';

type AdminAnnouncement = {
  id: string;
  message: string;
  type: AnnouncementType;
  linkUrl?: string;
  linkLabel?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type BannedItem = {
  type: 'username' | 'ip';
  value: string;
  reason?: string;
  created_at: string;
};

type AccountLimitItem = {
  type: 'username' | 'ip';
  value: string;
  maxAccounts: number;
  createdAt: string;
  updatedAt: string;
};

type AccountLookupResult = {
  query: { type: 'username' | 'ip'; value: string };
  accountCount: number;
  ipGroupCount?: number;
  accounts: { id: string; username: string; lastSeenAt?: string | null }[];
};

type AdminUserItem = {
  id: string;
  username: string;
  createdAt: string;
  lastActiveAt: string;
};

type AdminGrantItem = {
  userId: string;
  username: string;
  grantedBy: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type AdminFeedbackThread = {
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
};

type AdminFeedbackMessage = {
  id: string;
  senderUserId?: string;
  senderRole: 'user' | 'admin';
  message: string;
  createdAt: string;
};

type AdminAuditLogItem = {
  id: string;
  adminUserId: string;
  adminUsername: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

const ANNOUNCEMENT_MAX_CHARS = 260;

export default function AdminPage() {
  const { user, isLoggedIn, logout } = useAuthStore();
  const isAdmin = Boolean(user?.isAdmin);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState({ users: 0, activeSessions: 0, bannedUsernames: 0, bannedIps: 0, activeAnnouncements: 0 });
  const [bans, setBans] = useState<BannedItem[]>([]);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [accountLimits, setAccountLimits] = useState<AccountLimitItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [adminGrants, setAdminGrants] = useState<AdminGrantItem[]>([]);
  const [grantUsername, setGrantUsername] = useState('');
  const [grantExpiresDays, setGrantExpiresDays] = useState(0);
  const [feedbackThreads, setFeedbackThreads] = useState<AdminFeedbackThread[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [selectedFeedbackThreadId, setSelectedFeedbackThreadId] = useState<string | null>(null);
  const [feedbackMessages, setFeedbackMessages] = useState<AdminFeedbackMessage[]>([]);
  const [selectedFeedbackThreadMeta, setSelectedFeedbackThreadMeta] = useState<{ status: 'open' | 'answered' | 'closed'; closedExpiresAt?: string; closedRemainingMs?: number } | null>(null);
  const [feedbackReply, setFeedbackReply] = useState('');
  const [feedbackReplyStatus, setFeedbackReplyStatus] = useState<'open' | 'answered' | 'closed'>('answered');

  const [banType, setBanType] = useState<'username' | 'ip'>('username');
  const [banValue, setBanValue] = useState('');
  const [banReason, setBanReason] = useState('');
  const [deleteUsername, setDeleteUsername] = useState('');
  const [limitType, setLimitType] = useState<'username' | 'ip'>('ip');
  const [limitValue, setLimitValue] = useState('');
  const [limitAmount, setLimitAmount] = useState(1);
  const [lookupType, setLookupType] = useState<'username' | 'ip'>('username');
  const [lookupValue, setLookupValue] = useState('');
  const [lookupResult, setLookupResult] = useState<AccountLookupResult | null>(null);

  const [message, setMessage] = useState('');
  const [announcementType, setAnnouncementType] = useState<AnnouncementType>('info');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [isActive, setIsActive] = useState(true);

  const canManage = isLoggedIn && isAdmin;

  const sortedAnnouncements = useMemo(
    () => [...announcements].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [announcements]
  );

  const selectedFeedbackThread = useMemo(
    () => feedbackThreads.find((item) => item.id === selectedFeedbackThreadId) || null,
    [feedbackThreads, selectedFeedbackThreadId]
  );

  const sortedFeedbackThreads = useMemo(
    () => [...feedbackThreads].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [feedbackThreads]
  );

  const selectedFeedbackStatus = selectedFeedbackThreadMeta?.status || selectedFeedbackThread?.status || 'open';
  const selectedFeedbackClosedExpiresAt = selectedFeedbackThreadMeta?.closedExpiresAt || selectedFeedbackThread?.closedExpiresAt;
  const selectedFeedbackClosedRemainingMs = selectedFeedbackThreadMeta?.closedRemainingMs ?? selectedFeedbackThread?.closedRemainingMs;
  const announcementLength = message.length;
  const announcementRows = useMemo(() => {
    const softRows = Math.ceil(announcementLength / 70);
    const explicitRows = message.split('\n').length;
    return Math.max(3, Math.min(8, Math.max(softRows, explicitRows)));
  }, [announcementLength, message]);
  const announcementFontClass = announcementLength > 210
    ? 'text-[11px]'
    : announcementLength > 130
      ? 'text-[12px]'
      : 'text-[13px]';

  const formatAuditMeta = (meta: Record<string, unknown> | null) => {
    if (!meta) return '-';
    const text = JSON.stringify(meta);
    return text.length > 140 ? `${text.slice(0, 140)}...` : text;
  };

  const formatRemaining = (milliseconds?: number) => {
    if (!milliseconds || milliseconds <= 0) return 'less than 1 hour';
    const totalMinutes = Math.ceil(milliseconds / (1000 * 60));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    return `${Math.max(1, hours)}h`;
  };

  const loadAll = async () => {
    if (!canManage) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [overview, bansRes, annRes, limitRes, usersRes, feedbackRes, grantsRes, auditRes] = await Promise.all([
        loadAdminOverview(),
        loadAdminBans(),
        loadAdminAnnouncements(),
        loadAdminAccountLimits(),
        loadAdminUsers(),
        loadAdminFeedbackThreads(),
        loadAdminGrantList(),
        loadAdminAuditLogs(),
      ]);

      setStats(overview.stats);
      setBans(bansRes.items || []);
      setAnnouncements(annRes.items || []);
      setAccountLimits(limitRes.items || []);
      setAdminUsers(usersRes.items || []);
      setAdminGrants(grantsRes.items || []);
      setAuditLogs(auditRes.items || []);
      const nextFeedbackThreads = feedbackRes.items || [];
      setFeedbackThreads(nextFeedbackThreads);
      if (!selectedFeedbackThreadId || !nextFeedbackThreads.some((item) => item.id === selectedFeedbackThreadId)) {
        setSelectedFeedbackThreadId(nextFeedbackThreads[0]?.id || null);
      }
      if (selectedFeedbackThreadId) {
        const selected = nextFeedbackThreads.find((item) => item.id === selectedFeedbackThreadId);
        if (selected) {
          setSelectedFeedbackThreadMeta({
            status: selected.status,
            closedExpiresAt: selected.closedExpiresAt,
            closedRemainingMs: selected.closedRemainingMs,
          });
        }
      }
    } catch (error: any) {
      toast(error?.message || 'Failed to load admin data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [canManage]);

  useEffect(() => {
    const loadThreadMessages = async () => {
      if (!selectedFeedbackThreadId || !canManage) {
        setFeedbackMessages([]);
        setSelectedFeedbackThreadMeta(null);
        return;
      }
      try {
        const res = await loadAdminFeedbackMessages(selectedFeedbackThreadId);
        setFeedbackMessages(res.items || []);
        if (res.thread) {
          setSelectedFeedbackThreadMeta({
            status: res.thread.status,
            closedExpiresAt: res.thread.closedExpiresAt,
            closedRemainingMs: res.thread.closedRemainingMs,
          });
        }
      } catch (error: any) {
        toast(error?.message || 'Failed to load feedback messages', 'error');
        setFeedbackMessages([]);
        setSelectedFeedbackThreadMeta(null);
      }
    };

    loadThreadMessages();
  }, [selectedFeedbackThreadId, canManage]);

  const handleBanTarget = async () => {
    const value = banValue.trim();
    if (!value) {
      toast('Enter nickname or IP', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await banAdminTarget(banType, value, banReason.trim());
      setBanValue('');
      setBanReason('');
      await loadAll();
      toast(`${banType === 'ip' ? 'IP' : 'Nickname'} banned`, 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to ban target', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnban = async (type: 'username' | 'ip', value: string) => {
    setIsSubmitting(true);
    try {
      await unbanAdminTarget(type, value);
      await loadAll();
      toast('Target unbanned', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to unban target', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUserData = async () => {
    const username = deleteUsername.trim();
    if (!username) {
      toast('Enter nickname', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await deleteAdminUserByUsername(username);
      setDeleteUsername('');
      await loadAll();
      toast('User data deleted from D1', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to delete user data', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetLimit = async () => {
    const value = limitValue.trim();
    if (!value) {
      toast('Enter nickname or IP for override', 'error');
      return;
    }
    if (!Number.isFinite(limitAmount) || limitAmount < 1) {
      toast('Limit must be at least 1', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await setAdminAccountLimit(limitType, value, limitAmount);
      setLimitValue('');
      await loadAll();
      toast('Account limit override saved', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to save account limit override', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLimit = async (type: 'username' | 'ip', value: string) => {
    setIsSubmitting(true);
    try {
      await deleteAdminAccountLimit(type, value);
      await loadAll();
      toast('Account limit override removed', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to remove account limit override', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLookupAccounts = async () => {
    const value = lookupValue.trim();
    if (!value) {
      toast('Enter nickname or IP to inspect', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await lookupAdminAccounts(lookupType, value);
      setLookupResult(result);
      toast('Lookup completed', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to lookup accounts', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAllSessions = async () => {
    const shouldClear = window.confirm('This will force logout all users, including you. Continue?');
    if (!shouldClear) return;

    setIsSubmitting(true);
    try {
      const result = await clearAllActiveSessions();
      toast(`Cleared ${result.clearedCount} active sessions`, 'success');
      logout();
      window.location.href = '/login';
    } catch (error: any) {
      toast(error?.message || 'Failed to clear active sessions', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGrantAdmin = async () => {
    const username = grantUsername.trim();
    if (!username) {
      toast('Enter nickname to grant admin', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await grantAdminPermission(username, grantExpiresDays > 0 ? grantExpiresDays : undefined);
      setGrantUsername('');
      setGrantExpiresDays(0);
      await loadAll();
      toast(`Admin access granted to ${username}`, 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to grant admin access', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeAdmin = async (userId: string, username: string) => {
    const shouldRevoke = window.confirm(`Revoke admin access from "${username}"?`);
    if (!shouldRevoke) return;

    setIsSubmitting(true);
    try {
      await revokeAdminPermission(userId);
      await loadAll();
      toast(`Admin access revoked from ${username}`, 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to revoke admin access', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAnnouncement = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast('Message is required', 'error');
      return;
    }
    if (trimmed.length > ANNOUNCEMENT_MAX_CHARS) {
      toast(`Message is too long (max ${ANNOUNCEMENT_MAX_CHARS} chars)`, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await createAdminAnnouncement({
        message: trimmed,
        type: announcementType,
        linkUrl: linkUrl.trim() || undefined,
        linkLabel: linkLabel.trim() || undefined,
        isActive,
      });
      setMessage('');
      setLinkUrl('');
      setLinkLabel('');
      setAnnouncementType('info');
      setIsActive(true);
      await loadAll();
      toast('Announcement created', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to create announcement', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAnnouncement = async (item: AdminAnnouncement) => {
    setIsSubmitting(true);
    try {
      await updateAdminAnnouncement({
        id: item.id,
        message: item.message,
        type: item.type,
        linkUrl: item.linkUrl,
        linkLabel: item.linkLabel,
        isActive: !item.isActive,
      });
      await loadAll();
      toast(item.isActive ? 'Announcement hidden' : 'Announcement activated', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to update announcement', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    setIsSubmitting(true);
    try {
      await deleteAdminAnnouncement(id);
      await loadAll();
      toast('Announcement deleted', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to delete announcement', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplyFeedbackThread = async () => {
    if (!selectedFeedbackThreadId) {
      toast('Select a feedback thread first', 'error');
      return;
    }

    const body = feedbackReply.trim();
    if (!body) {
      toast('Reply cannot be empty', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await replyAdminFeedbackThread({
        threadId: selectedFeedbackThreadId,
        message: body,
        status: feedbackReplyStatus,
      });
      setFeedbackReply('');
      const [threadsRes, messagesRes] = await Promise.all([
        loadAdminFeedbackThreads(),
        loadAdminFeedbackMessages(selectedFeedbackThreadId),
      ]);
      setFeedbackThreads(threadsRes.items || []);
      setFeedbackMessages(messagesRes.items || []);
      if (messagesRes.thread) {
        setSelectedFeedbackThreadMeta({
          status: messagesRes.thread.status,
          closedExpiresAt: messagesRes.thread.closedExpiresAt,
          closedRemainingMs: messagesRes.thread.closedRemainingMs,
        });
      }
      toast('Reply sent to user', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to reply to feedback thread', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceDeleteFeedbackThread = async () => {
    if (!selectedFeedbackThreadId) {
      toast('Select a feedback thread first', 'error');
      return;
    }

    const shouldDelete = window.confirm('Force delete this entire feedback thread (messages + notifications)?');
    if (!shouldDelete) return;

    setIsSubmitting(true);
    try {
      const deletedId = selectedFeedbackThreadId;
      await deleteAdminFeedbackThread(deletedId);
      const remainingThreads = feedbackThreads.filter((item) => item.id !== deletedId);
      setFeedbackThreads(remainingThreads);
      setSelectedFeedbackThreadId(remainingThreads[0]?.id || null);
      setFeedbackMessages([]);
      setSelectedFeedbackThreadMeta(null);
      setFeedbackReply('');
      toast('Feedback thread force deleted', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to force delete feedback thread', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-24 pb-12">
        <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-8 text-center">
          <h1 className="text-[22px] font-bold text-text-primary tracking-tight">Admin Panel</h1>
          <p className="mt-2 text-[13px] text-text-muted">Sign in first to access administration tools.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-24 pb-12">
        <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-8 text-center">
          <h1 className="text-[22px] font-bold text-text-primary tracking-tight">Access denied</h1>
          <p className="mt-2 text-[13px] text-text-muted">This page is available only for admin accounts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-12 space-y-6">
      <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 md:p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Admin Panel</h1>
          <p className="mt-1 text-[13px] text-text-muted">Moderation, anti-abuse controls and account/session management.</p>
          <p className="mt-1 text-[11px] text-accent">UI rev: 2026-03-07-admin-fix-v2</p>
        </div>
        <button disabled={isSubmitting} onClick={handleClearAllSessions} className="btn-glass text-red-400">
          Force clear all active sessions
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Users" value={stats.users} />
        <StatCard label="Active sessions" value={stats.activeSessions} />
        <StatCard label="Banned nicknames" value={stats.bannedUsernames} />
        <StatCard label="Banned IPs" value={stats.bannedIps} />
        <StatCard label="Active announcements" value={stats.activeAnnouncements} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4 xl:col-span-2">
          <h2 className="text-[15px] font-semibold text-text-primary">Moderation & account controls</h2>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm">
              <h3 className="text-[13px] font-semibold text-text-primary">Nickname / IP bans</h3>
              <select className="input w-full" value={banType} onChange={(e) => setBanType(e.target.value as 'username' | 'ip')}>
                <option value="username">Nickname</option>
                <option value="ip">IP Address</option>
              </select>
              <input
                className="input w-full"
                placeholder={banType === 'ip' ? '1.2.3.4 or IPv6' : 'nickname'}
                value={banValue}
                onChange={(e) => setBanValue(e.target.value)}
              />
              <input className="input w-full" placeholder="Reason (optional)" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
              <button disabled={isSubmitting} onClick={handleBanTarget} className="btn-accent w-full">
                Ban target
              </button>

              <div className="max-h-56 overflow-auto space-y-2 pt-1">
                {isLoading ? (
                  <p className="text-[13px] text-text-muted">Loading...</p>
                ) : bans.length === 0 ? (
                  <p className="text-[13px] text-text-muted">No bans.</p>
                ) : (
                  bans.map((item) => (
                    <div key={`${item.type}:${item.value}`} className="rounded-[10px] p-2.5 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-medium text-text-primary break-all">[{item.type}] {item.value}</p>
                        <p className="text-[11px] text-text-muted">{item.reason || 'No reason provided'}</p>
                      </div>
                      <button
                        className="btn-glass whitespace-nowrap"
                        disabled={isSubmitting}
                        onClick={() => handleUnban(item.type, item.value)}
                      >
                        Unban
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm">
              <h3 className="text-[13px] font-semibold text-text-primary">Account limit overrides</h3>
              <select className="input w-full" value={limitType} onChange={(e) => setLimitType(e.target.value as 'username' | 'ip')}>
                <option value="ip">IP Address</option>
                <option value="username">Nickname</option>
              </select>
              <input
                className="input w-full"
                placeholder={limitType === 'ip' ? '1.2.3.4 or IPv6' : 'nickname'}
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
              />
              <input className="input w-full" type="number" min={1} max={200} value={limitAmount} onChange={(e) => setLimitAmount(Number(e.target.value || 1))} />
              <button disabled={isSubmitting} onClick={handleSetLimit} className="btn-accent w-full">
                Save override
              </button>

              <div className="max-h-56 overflow-auto space-y-2 pt-1">
                {accountLimits.length === 0 ? (
                  <p className="text-[11px] text-text-muted">No account limit overrides.</p>
                ) : (
                  accountLimits.map((item) => (
                    <div key={`${item.type}:${item.value}`} className="rounded-[10px] p-2.5 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-medium text-text-primary">[{item.type}] {item.value}</p>
                        <p className="text-[11px] text-text-muted">Max accounts: {item.maxAccounts}</p>
                      </div>
                      <button className="btn-glass whitespace-nowrap" disabled={isSubmitting} onClick={() => handleDeleteLimit(item.type, item.value)}>
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm">
              <h3 className="text-[13px] font-semibold text-text-primary">Account/IP lookup</h3>
              <p className="text-[11px] text-text-muted">Find user ID by nickname or show all nicknames linked to the same IP.</p>
              <select className="input w-full" value={lookupType} onChange={(e) => setLookupType(e.target.value as 'username' | 'ip')}>
                <option value="username">Nickname</option>
                <option value="ip">IP Address</option>
              </select>
              <input
                className="input w-full"
                placeholder={lookupType === 'ip' ? '1.2.3.4 or IPv6' : 'nickname'}
                value={lookupValue}
                onChange={(e) => setLookupValue(e.target.value)}
              />
              <button disabled={isSubmitting} onClick={handleLookupAccounts} className="btn-glass w-full">
                Check linked accounts
              </button>

              {lookupResult && (
                <div className="rounded-[10px] p-2.5 space-y-1">
                  <p className="text-[11px] text-text-muted break-all">Query: [{lookupResult.query.type}] {lookupResult.query.value}</p>
                  <p className="text-[13px] font-medium text-text-primary">Accounts found: {lookupResult.accountCount}</p>
                  {typeof lookupResult.ipGroupCount === 'number' && <p className="text-[11px] text-text-muted">Matched IP fingerprints: {lookupResult.ipGroupCount}</p>}
                  <div className="max-h-40 overflow-auto space-y-1.5 pt-1">
                    {lookupResult.accounts.length === 0 ? (
                      <p className="text-[11px] text-text-muted">No linked nicknames.</p>
                    ) : (
                      lookupResult.accounts.map((account) => (
                        <div key={account.id} className="rounded-[8px] bg-white/[0.03] px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[13px] font-medium text-text-primary">{account.username}</p>
                            <button
                              className="text-[10px] font-mono text-accent/70 hover:text-accent transition-colors"
                              onClick={() => { navigator.clipboard.writeText(account.id); toast('User ID copied', 'success'); }}
                              title="Click to copy full ID"
                            >
                              {account.id.slice(0, 12)}...
                            </button>
                          </div>
                          <p className="text-[11px] text-text-muted font-mono mt-0.5">ID: {account.id}</p>
                          {account.lastSeenAt && <p className="text-[11px] text-text-muted mt-0.5">Last seen: {new Date(account.lastSeenAt).toLocaleString()}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm">
              <h3 className="text-[13px] font-semibold text-text-primary">Delete user data by nickname</h3>
              <p className="text-[11px] text-text-muted">Permanently removes account, settings, sessions and watchlist from D1.</p>
              <input className="input w-full" placeholder="nickname" value={deleteUsername} onChange={(e) => setDeleteUsername(e.target.value)} />
              <button disabled={isSubmitting} onClick={handleDeleteUserData} className="btn-glass w-full text-red-400">
                Delete user data
              </button>
            </div>
          </div>
        </section>

        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
          <h2 className="text-[15px] font-semibold text-text-primary">Create announcement</h2>
          <textarea
            className={`input w-full resize-none break-all whitespace-pre-wrap ${announcementFontClass}`}
            placeholder="Write announcement message..."
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, ANNOUNCEMENT_MAX_CHARS))}
            maxLength={ANNOUNCEMENT_MAX_CHARS}
            rows={announcementRows}
          />
          <p className="text-right text-[11px] text-text-muted">{announcementLength}/{ANNOUNCEMENT_MAX_CHARS}</p>

          <div className="grid grid-cols-2 gap-2">
            <select className="input w-full" value={announcementType} onChange={(e) => setAnnouncementType(e.target.value as AnnouncementType)}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="update">Update</option>
              <option value="success">Success</option>
            </select>
            <label className="flex items-center gap-2 rounded-[10px] bg-[var(--bg-glass-light)] px-3 py-2 text-[13px] text-text-secondary">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active now
            </label>
          </div>

          <input className="input w-full" placeholder="Optional link URL (https://...)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <input className="input w-full" placeholder="Optional link label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={60} />

          <button disabled={isSubmitting} onClick={handleCreateAnnouncement} className="btn-accent w-full">
            Publish announcement
          </button>
        </section>
      </div>

      <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">Admin permissions</h2>
          <p className="text-[11px] text-text-muted">Grant or revoke admin access. Optionally set an expiration.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            className="input w-full"
            placeholder="Nickname to grant admin"
            value={grantUsername}
            onChange={(e) => setGrantUsername(e.target.value)}
          />
          <select
            className="input"
            value={grantExpiresDays}
            onChange={(e) => setGrantExpiresDays(Number(e.target.value))}
          >
            <option value={0}>No expiration</option>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
          <button disabled={isSubmitting} onClick={handleGrantAdmin} className="btn-accent whitespace-nowrap">
            Grant admin
          </button>
        </div>

        <div className="max-h-64 overflow-auto rounded-[12px] bg-[var(--bg-glass-light)]">
          {isLoading ? (
            <p className="p-3 text-[13px] text-text-muted">Loading...</p>
          ) : adminGrants.length === 0 ? (
            <p className="p-3 text-[13px] text-text-muted">No admin users found.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--bg-glass-light)]">
                <tr className="text-left text-[11px] text-text-muted">
                  <th className="px-3 py-2 font-medium">Nick</th>
                  <th className="px-3 py-2 font-medium">User ID</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium">Granted</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {adminGrants.map((item) => (
                  <tr key={item.userId} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-text-primary">{item.username}</td>
                    <td className="px-3 py-2 text-text-muted text-[11px] font-mono">{item.userId.slice(0, 12)}...</td>
                    <td className="px-3 py-2 text-text-muted">
                      {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-3 py-2 text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      <button
                        className="btn-glass text-red-400 text-[11px]"
                        disabled={isSubmitting || item.userId === user?.id}
                        onClick={() => handleRevokeAdmin(item.userId, item.username)}
                      >
                        {item.userId === user?.id ? 'You' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Users</h2>
        <p className="text-[11px] text-text-muted">Nick, account creation date and last active timestamp.</p>
        <div className="max-h-96 overflow-auto rounded-[12px] bg-[var(--bg-glass-light)]">
          {isLoading ? (
            <p className="p-3 text-[13px] text-text-muted">Loading...</p>
          ) : adminUsers.length === 0 ? (
            <p className="p-3 text-[13px] text-text-muted">No users found.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--bg-glass-light)]">
                <tr className="text-left text-[11px] text-text-muted">
                  <th className="px-3 py-2 font-medium">Nick</th>
                  <th className="px-3 py-2 font-medium">User ID</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-text-primary">{item.username}</td>
                    <td className="px-3 py-2">
                      <button
                        className="text-[11px] font-mono text-text-muted hover:text-accent transition-colors"
                        onClick={() => { navigator.clipboard.writeText(item.id); toast('User ID copied', 'success'); }}
                        title="Click to copy full ID"
                      >
                        {item.id.slice(0, 12)}...
                      </button>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-text-muted">{new Date(item.lastActiveAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Audit log</h2>
        <p className="text-[11px] text-text-muted">Latest admin actions recorded by backend.</p>
        <div className="max-h-96 overflow-auto rounded-[12px] bg-[var(--bg-glass-light)]">
          {isLoading ? (
            <p className="p-3 text-[13px] text-text-muted">Loading...</p>
          ) : auditLogs.length === 0 ? (
            <p className="p-3 text-[13px] text-text-muted">No audit entries yet.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--bg-glass-light)]">
                <tr className="text-left text-[11px] text-text-muted">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Admin</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Meta</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-text-muted whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-text-primary">{item.adminUsername || item.adminUserId.slice(0, 12)}</td>
                    <td className="px-3 py-2 text-text-muted">{item.action}</td>
                    <td className="px-3 py-2 text-text-muted break-all">{item.targetType}:{item.targetId || '-'}</td>
                    <td className="px-3 py-2 text-text-muted break-all">{formatAuditMeta(item.meta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">Feedback inbox</h2>
          <p className="text-[11px] text-text-muted">User bug reports, contact messages and feature requests. Replies here notify only the thread owner.</p>
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="h-[72vh] min-h-[460px] max-h-[760px] overflow-auto rounded-[12px] bg-[var(--bg-glass-light)] p-2 backdrop-blur-sm">
            {isLoading ? (
              <p className="px-2 py-4 text-[13px] text-text-muted">Loading...</p>
            ) : sortedFeedbackThreads.length === 0 ? (
              <p className="px-2 py-4 text-[13px] text-text-muted">No feedback threads yet.</p>
            ) : (
              <div className="space-y-1.5">
                {sortedFeedbackThreads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedFeedbackThreadId(thread.id)}
                    className={`w-full rounded-[8px] px-2.5 py-2 text-left transition-all ${
                      selectedFeedbackThreadId === thread.id ? 'border-accent/30 bg-accent/10 shadow-[0_1px_6px_var(--accent-glow)]' : 'border-transparent hover:bg-[var(--bg-glass-light)]'
                    }`}
                  >
                    <p className="text-[12px] font-semibold text-text-primary line-clamp-1">{thread.subject}</p>
                    <p className="mt-0.5 text-[11px] text-text-muted">{thread.username} · {thread.category} · {thread.status === 'answered' ? 'resolved' : thread.status}</p>
                    <p className="mt-1 text-[11px] text-text-muted">{new Date(thread.lastReplyAt).toLocaleString()}</p>
                    {thread.status === 'closed' && <p className="mt-1 text-[11px] text-red-500">Auto-delete in {formatRemaining(thread.closedRemainingMs)}</p>}
                    {thread.hasUnreadFromUser && <p className="mt-1 text-[11px] font-semibold text-accent">Unread from user</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 min-h-[460px] h-[72vh] max-h-[760px] overflow-hidden flex flex-col backdrop-blur-sm">
            {!selectedFeedbackThread ? (
              <div className="flex h-full items-center justify-center text-[13px] text-text-muted">Select a feedback thread to view details</div>
            ) : (
              <>
                <div className="border-b border-[var(--border)] pb-2">
                  <p className="text-[13px] font-semibold text-text-primary line-clamp-1">{selectedFeedbackThread.subject}</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">{selectedFeedbackThread.username} · {selectedFeedbackThread.category} · {selectedFeedbackStatus === 'answered' ? 'resolved' : selectedFeedbackStatus}</p>
                  {selectedFeedbackStatus === 'answered' && <p className="mt-1 text-[11px] font-semibold text-emerald-500">Marked as resolved</p>}
                  {selectedFeedbackStatus === 'closed' && (
                    <p className="mt-1 text-[11px] font-semibold text-red-500">
                      Archived thread · auto-delete in {formatRemaining(selectedFeedbackClosedRemainingMs)}
                      {selectedFeedbackClosedExpiresAt ? ` · ${new Date(selectedFeedbackClosedExpiresAt).toLocaleString()}` : ''}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex-1 min-h-0 space-y-2 overflow-auto pr-1">
                  {feedbackMessages.length === 0 ? (
                    <p className="text-[13px] text-text-muted">No messages in this thread yet.</p>
                  ) : (
                    feedbackMessages.map((item) => (
                      <div
                        key={item.id}
                        className={`max-w-[92%] rounded-[12px] px-3 py-2.5 text-[13px] leading-relaxed ${
                          item.senderRole === 'admin'
                            ? 'ml-auto bg-accent/10 text-text-primary'
                            : ' bg-[var(--bg-glass-light)] text-text-secondary'
                        }`}
                      >
                        <p className="mb-1 text-[11px] font-semibold opacity-80">{item.senderRole === 'admin' ? 'Admin' : selectedFeedbackThread.username}</p>
                        <p className="whitespace-pre-wrap">{item.message}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 border-t border-[var(--border)] pt-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <textarea
                      className="input min-h-24 w-full"
                      value={feedbackReply}
                      onChange={(event) => setFeedbackReply(event.target.value)}
                      placeholder="Write admin reply..."
                      maxLength={4000}
                    />
                    <select
                      className="input w-full sm:w-40"
                      value={feedbackReplyStatus}
                      onChange={(event) => setFeedbackReplyStatus(event.target.value as 'open' | 'answered' | 'closed')}
                    >
                      <option value="open">Keep open</option>
                      <option value="answered">Mark answered</option>
                      <option value="closed">Close thread</option>
                    </select>
                  </div>
                  <button disabled={isSubmitting} onClick={handleReplyFeedbackThread} className="btn-accent w-full">
                    Send admin reply
                  </button>
                  <button disabled={isSubmitting} onClick={handleForceDeleteFeedbackThread} className="btn-glass w-full text-red-400">
                    Force delete thread
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Announcements list</h2>
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-[13px] text-text-muted">Loading...</p>
          ) : sortedAnnouncements.length === 0 ? (
            <p className="text-[13px] text-text-muted">No announcements yet.</p>
          ) : (
            sortedAnnouncements.map((item) => (
              <div key={item.id} className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between backdrop-blur-sm">
                <div>
                  <p className="break-all whitespace-pre-wrap text-[13px] font-medium text-text-primary">{item.message}</p>
                  <p className="text-[11px] text-text-muted mt-1">{item.type.toUpperCase()} • {item.isActive ? 'Active' : 'Hidden'}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-glass" disabled={isSubmitting} onClick={() => handleToggleAnnouncement(item)}>
                    {item.isActive ? 'Hide' : 'Activate'}
                  </button>
                  <button className="btn-glass text-red-400" disabled={isSubmitting} onClick={() => handleDeleteAnnouncement(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-4">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="mt-1 text-[22px] font-bold text-text-primary tracking-tight">{value}</p>
    </div>
  );
}
