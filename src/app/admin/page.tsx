'use client';

import { AdminSurveys } from '@/components/admin/AdminSurveys';
import { toast } from '@/components/ui/Toaster';
import {
  banAdminTarget,
  clearAllActiveSessions,
  cloudFetch,
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
  resetUserPassword,
  revokeAdminPermission,
  setAdminAccountLimit,
  unbanAdminTarget,
  updateAdminAnnouncement,
} from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
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
  role: string;
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

type FebboxTokenItem = {
  token: string;
  label: string;
  is_active: number;
  is_banned: number;
  usage_count: number;
  error_count: number;
  last_used_at: string | null;
  created_at: string;
};

export default function AdminPage() {
  const { user, isLoggedIn, logout } = useAuthStore();

  const userRole = user?.role || (user?.isAdmin ? 'admin' : null);
  const isModerator = userRole === 'moderator';
  const isAdminRole = userRole === 'admin';
  const isOwner = userRole === 'owner';
  const hasAdminPanelAccess = isLoggedIn && (isModerator || isAdminRole || isOwner);

  const canManageModeration = isOwner || isAdminRole;
  const canManageAdmins = isOwner || isAdminRole;
  const canManageSystem = isOwner;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState({ users: 0, activeSessions: 0, banned: 0, activeAnnouncements: 0, activeUsers: 0, activeGuests: 0 });
  const [bans, setBans] = useState<BannedItem[]>([]);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [accountLimits, setAccountLimits] = useState<AccountLimitItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSortKey, setUserSortKey] = useState<'username' | 'createdAt' | 'lastActiveAt'>('lastActiveAt');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');
  const [adminGrants, setAdminGrants] = useState<AdminGrantItem[]>([]);
  const [grantUsername, setGrantUsername] = useState('');
  const [grantRole, setGrantRole] = useState<'moderator' | 'admin' | 'owner'>('moderator');
  const [grantExpiresDays, setGrantExpiresDays] = useState(0);
  const [feedbackThreads, setFeedbackThreads] = useState<AdminFeedbackThread[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [selectedFeedbackThreadId, setSelectedFeedbackThreadId] = useState<string | null>(null);
  const [feedbackInboxTab, setFeedbackInboxTab] = useState<'active' | 'archive'>('active');
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

  const canManage = hasAdminPanelAccess;

  useEffect(() => {
    if (!selectedFeedbackThreadId || !canManage) return;

    const pollInterval = setInterval(() => {
      loadAdminFeedbackMessages(selectedFeedbackThreadId)
        .then(res => setFeedbackMessages(res.items || []))
        .catch(() => {});
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [selectedFeedbackThreadId, canManage]);

  const sortedAnnouncements = useMemo(
    () => [...announcements].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [announcements]
  );

  const selectedFeedbackThread = useMemo(
    () => feedbackThreads.find((item) => item.id === selectedFeedbackThreadId) || null,
    [feedbackThreads, selectedFeedbackThreadId]
  );

  const sortedFeedbackThreads = useMemo(() => {
    const filtered = feedbackThreads.filter(t =>
      feedbackInboxTab === 'active' ? t.status !== 'closed' : t.status === 'closed'
    );
    return [...filtered].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [feedbackThreads, feedbackInboxTab]);

  const selectedFeedbackStatus = selectedFeedbackThreadMeta?.status || selectedFeedbackThread?.status || 'open';
  const selectedFeedbackClosedExpiresAt = selectedFeedbackThreadMeta?.closedExpiresAt || selectedFeedbackThread?.closedExpiresAt;
  const selectedFeedbackClosedRemainingMs = selectedFeedbackThreadMeta?.closedRemainingMs ?? selectedFeedbackThread?.closedRemainingMs;
  const announcementLength = message.length;
  const announcementRows = useMemo(() => {
    const softRows = Math.ceil(announcementLength / 70);
    const explicitRows = message.split('\n').length;
    return Math.max(3, Math.min(8, Math.max(softRows, explicitRows)));
  }, [announcementLength, message]);

  const filteredAndSortedUsers = useMemo(() => {
    const filtered = adminUsers.filter(u =>
      u.username.toLowerCase().includes(userSearchQuery.toLowerCase())
    );

    return filtered.sort((a, b) => {
      const valA = a[userSortKey] || '';
      const valB = b[userSortKey] || '';

      if (userSortOrder === 'asc') {
        return valA < valB ? -1 : valA > valB ? 1 : 0;
      } else {
        return valA > valB ? -1 : valA < valB ? 1 : 0;
      }
    });
  }, [adminUsers, userSearchQuery, userSortKey, userSortOrder]);
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
      const overview = await loadAdminOverview();
      setStats(overview.stats);

      const promises: Promise<any>[] = [
        loadAdminUsers(),
        loadAdminFeedbackThreads(),
      ];

      if (canManageModeration) {
        promises.push(loadAdminBans());
        promises.push(loadAdminAnnouncements());
        promises.push(loadAdminAccountLimits());
        promises.push(loadAdminAuditLogs());
      }

      if (canManageAdmins) {
        promises.push(loadAdminGrantList());
      }

      const results = await Promise.all(promises);

      setAdminUsers(results[0].items || []);
      const nextFeedbackThreads = results[1].items || [];
      setFeedbackThreads(nextFeedbackThreads);

      if (canManageModeration) {
        setBans(results[2].items || []);
        setAnnouncements(results[3].items || []);
        setAccountLimits(results[4].items || []);
        setAuditLogs(results[5].items || []);
      }

      if (canManageAdmins) {
        const grantIndex = canManageModeration ? 6 : 2;
        if (results[grantIndex]) {
          setAdminGrants(results[grantIndex].items || []);
        }
      }

      if (!selectedFeedbackThreadId || !nextFeedbackThreads.some((item: any) => item.id === selectedFeedbackThreadId)) {
        setSelectedFeedbackThreadId(nextFeedbackThreads[0]?.id || null);
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

  const handleDeleteUser = async () => {
    const username = deleteUsername.trim();
    if (!username) {
      toast('Enter nickname', 'error');
      return;
    }
    if (!confirm('This action cannot be undone. Are you sure?')) return;

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

  const handleResetPassword = async () => {
    const username = deleteUsername.trim();
    if (!username) {
      toast('Enter nickname first', 'error');
      return;
    }
    if (!confirm(`Reset password for ${username}? This will generate a temporary one.`)) return;

    setIsSubmitting(true);
    try {
      const res = await resetUserPassword(username);
      if (res.temporaryPassword) {
        prompt('Password reset successful. Copy the temporary password:', res.temporaryPassword);
      } else {
        toast('Password reset, but no temp password returned.', 'warning');
      }
    } catch (error: any) {
      toast(error?.message || 'Failed to reset password', 'error');
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
      await grantAdminPermission(username, grantExpiresDays > 0 ? grantExpiresDays : undefined, grantRole);
      setGrantUsername('');
      setGrantExpiresDays(0);
      setGrantRole('moderator');
      await loadAll();
      toast(`${grantRole} access granted to ${username}`, 'success');
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

  const handleCreateAdminChat = async (targetUserId: string, targetUsername: string) => {
    const subject = window.prompt(`Chat subject for ${targetUsername}:`, 'Support Message');
    if (!subject) return;
    const initialMessage = window.prompt(`Message for ${targetUsername}:`);
    if (!initialMessage) return;

    setIsSubmitting(true);
    try {
      const res = await cloudFetch<{ threadId: string }>('/admin/feedback/create-chat', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId,
          subject,
          message: initialMessage,
        }),
      });

      const threadsRes = await loadAdminFeedbackThreads();
      setFeedbackThreads(threadsRes.items || []);
      setFeedbackInboxTab('active');
      setSelectedFeedbackThreadId(res.threadId);
      toast('Chat thread created', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to create chat thread', 'error');
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

  if (!hasAdminPanelAccess) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-24 pb-12">
        <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-8 text-center">
          <h1 className="text-[22px] font-bold text-text-primary tracking-tight">Access denied</h1>
          <p className="mt-2 text-[13px] text-text-muted">This page is available only for authorized staff.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-12 space-y-6">
      <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 md:p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Admin Panel</h1>
          <p className="mt-1 text-[13px] text-text-muted">Moderation and management as <span className="text-accent font-semibold">{userRole}</span>.</p>
        </div>
        {canManageSystem && (
          <button disabled={isSubmitting} onClick={handleClearAllSessions} className="btn-glass text-red-400">
            Force clear all active sessions
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Users" value={stats.users} />
        <StatCard
          label="Active"
          value={stats.activeUsers + stats.activeGuests}
          isAccent
          subValue={`${stats.activeUsers} Users / ${stats.activeGuests} Guests`}
        />
        <StatCard
          label="Sessions"
          value={stats.activeSessions}
        />
        <StatCard label="Banned" value={stats.banned} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {canManageModeration && (
          <>
            <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
              <h2 className="text-[15px] font-semibold text-text-primary">Moderation & account controls</h2>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm">
                  <h3 className="text-[13px] font-semibold text-text-primary">Nickname bans</h3>
                  <input
                    className="input w-full"
                    placeholder="Enter nickname to ban"
                    value={banValue}
                    onChange={(e) => setBanValue(e.target.value)}
                  />
                  <input className="input w-full" placeholder="Reason (optional)" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
                  <button disabled={isSubmitting} onClick={handleBanTarget} className="btn-accent w-full">
                    Ban user
                  </button>

                  <div className="max-h-56 overflow-auto space-y-2 pt-1">
                    {isLoading ? (
                      <p className="text-[13px] text-text-muted">Loading...</p>
                    ) : bans.length === 0 ? (
                      <p className="text-[13px] text-text-muted">No bans.</p>
                    ) : (
                      bans.map((item) => (
                        <div key={`${item.type}:${item.value}`} className="rounded-[10px] p-2.5 flex items-start justify-between gap-2 bg-white/5">
                          <div>
                            <p className="text-[12px] font-medium text-text-primary break-all">{item.value}</p>
                            <p className="text-[11px] text-text-muted">{item.reason || 'No reason provided'}</p>
                          </div>
                          <button
                            className="btn-glass whitespace-nowrap text-[11px]"
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

                <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm text-red-400/90 border border-red-500/10">
                  <h3 className="text-[13px] font-semibold">Danger Zone</h3>
                  <p className="text-[11px] text-red-400/60">Wipe user data permanently or reset account password.</p>
                  <input className="input w-full border-red-500/20 focus:border-red-500/40" placeholder="Enter nickname" value={deleteUsername} onChange={(e) => setDeleteUsername(e.target.value)} />
                  <div className="flex gap-2">
                    <button disabled={isSubmitting} onClick={handleDeleteUser} className="btn-glass flex-1 text-red-400 hover:bg-red-500/10">
                      Delete user data
                    </button>
                    {isOwner && (
                      <button disabled={isSubmitting} onClick={handleResetPassword} className="btn-glass flex-1 text-amber-400 hover:bg-amber-500/10">
                        Reset Password
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm">
                  <h3 className="text-[13px] font-semibold text-text-primary">Nickname lookup</h3>
                  <p className="text-[11px] text-text-muted">Find all accounts linked to the same fingerprints as this nickname.</p>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder="nickname"
                      value={lookupValue}
                      onChange={(e) => setLookupValue(e.target.value)}
                    />
                    <button disabled={isSubmitting} onClick={handleLookupAccounts} className="btn-glass">
                      Lookup
                    </button>
                  </div>

                  {lookupResult && (
                    <div className="rounded-[10px] p-2.5 space-y-1 bg-white/5">
                      <p className="text-[13px] font-medium text-text-primary">Accounts found: {lookupResult.accountCount}</p>
                      <div className="max-h-40 overflow-auto space-y-1.5 pt-1">
                        {lookupResult.accounts.map((account) => (
                          <div key={account.id} className="rounded-[8px] bg-white/5 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-[13px] font-medium text-text-primary">{account.username}</p>
                                <p className="text-[10px] font-mono text-white/30">{account.id.slice(0, 8)}...</p>
                              </div>
                              <button
                                onClick={() => handleCreateAdminChat(account.id, account.username)}
                                className="btn-accent px-3 py-1 rounded-[6px] text-[10px]"
                              >
                                Chat
                              </button>
                            </div>
                            {account.lastSeenAt && <p className="text-[10px] text-white/20 mt-0.5">Last seen: {new Date(account.lastSeenAt).toLocaleString()}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm">
                  <h3 className="text-[13px] font-semibold text-text-primary">User account limit</h3>
                  <p className="text-[11px] text-text-muted">Override max accounts allowed for this specific user's fingerprint.</p>
                  <div className="grid gap-2">
                    <input
                      className="input w-full"
                      placeholder="nickname"
                      value={limitValue}
                      onChange={(e) => setLimitValue(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <input className="input flex-1" type="number" min={1} max={200} value={limitAmount} onChange={(e) => setLimitAmount(Number(e.target.value || 1))} />
                      <button disabled={isSubmitting} onClick={handleSetLimit} className="btn-accent">
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="max-h-40 overflow-auto space-y-1 pt-1">
                    {accountLimits.map((item) => (
                      <div key={`${item.type}:${item.value}`} className="rounded-[10px] p-2 flex items-center justify-between gap-2 bg-white/5">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-text-primary truncate">{item.value}</p>
                          <p className="text-[10px] text-text-muted">Limit: {item.maxAccounts}</p>
                        </div>
                        <button className="btn-glass text-red-400 text-[10px]" disabled={isSubmitting} onClick={() => handleDeleteLimit(item.type, item.value)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
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
          </>
        )}
      </div>

      {canManageAdmins && (
        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Staff permissions</h2>
              <p className="text-[11px] text-text-muted">Grant or revoke access. Admins can only grant Moderator role.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
              <input
                className="input w-full"
                placeholder="Nickname to grant access"
                value={grantUsername}
                onChange={(e) => setGrantUsername(e.target.value)}
              />
              <select
                className="input"
                value={grantRole}
                onChange={(e) => setGrantRole(e.target.value as any)}
              >
                <option value="moderator">Moderator</option>
                {isOwner && <option value="admin">Admin</option>}
                {isOwner && <option value="owner">Owner</option>}
              </select>
              <select
                className="input"
                value={grantExpiresDays}
                onChange={(e) => setGrantExpiresDays(Number(e.target.value))}
              >
                <option value={0}>No expiration</option>
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
              </select>
              <button disabled={isSubmitting} onClick={handleGrantAdmin} className="btn-accent whitespace-nowrap">
                Grant access
              </button>
            </div>

            <div className="max-h-64 overflow-auto rounded-[12px] bg-[var(--bg-glass-light)]">
              {isLoading ? (
                <p className="p-3 text-[13px] text-text-muted">Loading...</p>
              ) : adminGrants.length === 0 ? (
                <p className="p-3 text-[13px] text-text-muted">No staff found.</p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead className="bg-[var(--bg-glass-light)]">
                    <tr className="text-left text-[11px] text-text-muted">
                      <th className="px-3 py-2 font-medium">Nick</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Expires</th>
                      <th className="px-3 py-2 font-medium">Granted</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminGrants.map((item) => (
                      <tr key={item.userId} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 text-text-primary">{item.username}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            item.role === 'owner' ? 'bg-amber-500/20 text-amber-500' :
                            item.role === 'admin' ? 'bg-red-500/20 text-red-500' :
                            'bg-emerald-500/20 text-emerald-500'
                          }`}>
                            {item.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-muted">
                          {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-3 py-2 text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2">
                          {item.userId === user?.id ? (
                            <button className="btn-glass text-text-muted text-[11px] cursor-default opacity-60" disabled>
                              You
                            </button>
                          ) : (isAdminRole && (item.role === 'admin' || item.role === 'owner')) || (isModerator) ? (
                            <button className="btn-glass text-text-muted text-[11px] cursor-default opacity-40" title="Insufficient permissions to revoke this role" disabled>
                              Can't Revoke
                            </button>
                          ) : (
                            <button
                              className="btn-glass text-red-400 text-[11px]"
                              disabled={isSubmitting}
                              onClick={() => handleRevokeAdmin(item.userId, item.username)}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

      <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">Users</h2>
            <p className="text-[11px] text-text-muted">Nick, ID and activity logs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
            <div className="relative">
              <input
                className="input-minimal py-1.5 px-3 text-[12px] w-40 sm:w-48 bg-white/5 border border-white/10 rounded-[8px] focus:bg-white/10 transition-all"
                placeholder="Nick search..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
              />
              {userSearchQuery && (
                <button onClick={() => setUserSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">×</button>
              )}
            </div>
            <select
              className="input-minimal py-1.5 px-3 text-[12px] w-auto bg-transparent border-none text-white/70 font-bold cursor-pointer hover:text-white transition-colors"
              value={`${userSortKey}-${userSortOrder}`}
              onChange={(e) => {
                const [key, order] = e.target.value.split('-') as [any, any];
                setUserSortKey(key);
                setUserSortOrder(order);
              }}
            >
              <option value="lastActiveAt-desc">Recent Activity</option>
              <option value="lastActiveAt-asc">Oldest Activity</option>
              <option value="createdAt-desc">Newest Users</option>
              <option value="createdAt-asc">Oldest Users</option>
              <option value="username-asc">Name A-Z</option>
              <option value="username-desc">Name Z-A</option>
            </select>
          </div>
        </div>

        <div className="max-h-96 overflow-auto rounded-[12px] bg-[var(--bg-glass-light)] custom-scrollbar">
          {isLoading ? (
            <p className="p-3 text-[13px] text-text-muted">Loading...</p>
          ) : filteredAndSortedUsers.length === 0 ? (
            <p className="p-12 text-center text-[13px] text-text-muted">No users found matching your search.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-white/5 sticky top-0 z-10 backdrop-blur-md">
                <tr className="text-left text-[11px] text-text-muted">
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider">Nick</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider">User ID</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider">Created</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider">Last active</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedUsers.map((item) => (
                  <tr key={item.id} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-3 text-text-primary font-medium">{item.username}</td>
                    <td className="px-3 py-3">
                      <button
                        className="text-[11px] font-mono text-text-muted hover:text-accent transition-colors"
                        onClick={() => { navigator.clipboard.writeText(item.id); toast('User ID copied', 'success'); }}
                        title="Click to copy full ID"
                      >
                        {item.id.slice(0, 12)}...
                      </button>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-text-muted">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-3 text-[12px] text-text-muted">{new Date(item.lastActiveAt).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => handleCreateAdminChat(item.id, item.username)}
                        className="btn-glass text-[10px] py-1.5 px-3 bg-white/5 border-white/5 hover:bg-white/10"
                      >
                        Chat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {canManageModeration && (
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
      )}

      <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">Feedback inbox</h2>
            <p className="text-[11px] text-text-muted">User reports and chat threads.</p>
          </div>
          <div className="flex gap-1.5 p-1 rounded-xl bg-white/5 w-fit">
            <button
              onClick={() => setFeedbackInboxTab('active')}
              className={cn("px-3 py-1.5 rounded-[8px] text-[11px] font-bold transition-all", feedbackInboxTab === 'active' ? "bg-accent text-white shadow-md" : "text-white/40 hover:text-white")}
            >
              Active
            </button>
            <button
              onClick={() => setFeedbackInboxTab('archive')}
              className={cn("px-3 py-1.5 rounded-[8px] text-[11px] font-bold transition-all", feedbackInboxTab === 'archive' ? "bg-accent text-white shadow-md" : "text-white/40 hover:text-white")}
            >
              Archive
            </button>
          </div>
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
                      Archived thread (read-only) · Permanently stored for staff
                    </p>
                  )}
                </div>

                <div className="mt-3 flex-1 min-h-0 space-y-3 overflow-auto pr-1">
                  {feedbackMessages.length === 0 ? (
                    <p className="text-[13px] text-text-muted">No messages in this thread yet.</p>
                  ) : (
                    feedbackMessages.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "flex flex-col gap-1",
                          item.senderRole === 'admin' ? "items-end" : "items-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-[18px] px-4 py-2.5 text-[13px] leading-relaxed shadow-sm",
                            item.senderRole === 'admin'
                              ? "bg-accent text-white rounded-tr-[4px]"
                              : "bg-white/10 text-white/90 rounded-tl-[4px]"
                          )}
                        >
                          <p className="whitespace-pre-wrap">{item.message}</p>
                        </div>
                        <p className="text-[10px] text-white/30 px-1 font-medium">
                          {item.senderRole === 'admin' ? 'Support' : selectedFeedbackThread.username} · {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 border-t border-[var(--border)] pt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFeedbackReplyStatus('answered')}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-bold transition-all border",
                        feedbackReplyStatus === 'answered' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-white/40 border-transparent hover:text-white"
                      )}
                    >
                      Resolve on send
                    </button>
                    <button
                      onClick={() => setFeedbackReplyStatus('open')}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-bold transition-all border",
                        feedbackReplyStatus === 'open' ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-white/5 text-white/40 border-transparent hover:text-white"
                      )}
                    >
                      Keep Open
                    </button>
                    <button
                      onClick={() => setFeedbackReplyStatus('closed')}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-bold transition-all border text-red-400 hover:bg-red-500/10",
                        feedbackReplyStatus === 'closed' ? "bg-red-500/20 border-red-500/30" : "border-transparent"
                      )}
                    >
                      Archive
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <textarea
                      className="input min-h-12 max-h-32 flex-1"
                      value={feedbackReply}
                      onChange={(event) => setFeedbackReply(event.target.value)}
                      placeholder="Write message..."
                      maxLength={4000}
                      rows={1}
                    />
                    <button
                      disabled={isSubmitting || !feedbackReply.trim()}
                      onClick={handleReplyFeedbackThread}
                      className="btn-accent px-5 shrink-0"
                    >
                      Send
                    </button>
                  </div>
                  {isOwner && (
                    <button
                      disabled={isSubmitting}
                      onClick={handleForceDeleteFeedbackThread}
                      className="btn-glass w-full text-red-400 mt-2"
                    >
                      Force delete thread
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {canManageModeration && (
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
      )}

      {!isModerator && (
        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-3">
          <AdminSurveys />
        </section>
      )}
    </div>
  );
}
function StatCard({ label, value, isAccent, subValue }: { label: string; value: number; isAccent?: boolean; subValue?: string }) {
  return (
    <div className={`glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-4 ${isAccent ? 'border-accent/30 shadow-[0_0_15px_var(--accent-glow)]' : ''}`}>
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`mt-1 text-[22px] font-bold tracking-tight ${isAccent ? 'text-accent' : 'text-text-primary'}`}>{value}</p>
      {subValue && <p className="mt-1 text-[10px] text-text-muted/60 font-medium">{subValue}</p>}
    </div>
  );
}
