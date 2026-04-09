'use client';

import { AdminSurveys } from '@/components/admin/AdminSurveys';
import { toast } from '@/components/ui/Toaster';
import {
  addAdminBlockedMedia,
  banAdminTarget,
  clearAllActiveSessions,
  clearUserActiveSessions,
  cloudFetch,
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  deleteAdminBlockedMedia,
  deleteAdminFeedbackThread,
  deleteAdminUserByUsername,
  grantAdminPermission,
  loadAdminAnnouncements,
  loadAdminAuditLogs,
  loadAdminBans,
  loadAdminBlockedMedia,
  loadAdminFeedbackMessages,
  loadAdminFeedbackThreads,
  loadAdminGrantList,
  loadAdminOverview,
  loadAdminUsers,
  replyAdminFeedbackThread,
  resetUserPassword,
  revokeAdminPermission,
  unbanAdminTarget,
  updateAdminAnnouncement,
} from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import Link from 'next/link';
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
  userId?: string;
  linkedUserIds?: string[];
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

type BlockedMediaItem = {
  tmdbId: string;
  mediaType: string;
  reason: string | null;
  createdAt: string;
};

const ANNOUNCEMENT_MAX_CHARS = 260;
const AUDIT_PAGE_SIZE = 20;
const FEEDBACK_ARCHIVE_MESSAGE = 'Thank you for your message. This thread has been reviewed and archived. If you need more help, please open a new feedback thread.';
const FEEDBACK_UNARCHIVE_MESSAGE = 'This thread has been reopened by support. You can continue this conversation here.';

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
  const [serverRole, setServerRole] = useState<'owner' | 'admin' | 'moderator' | null>(null);

  const userRole = serverRole || user?.role || (user?.isAdmin ? 'admin' : null);
  const isModerator = userRole === 'moderator';
  const isAdminRole = userRole === 'admin';
  const isOwner = userRole === 'owner';
  const isOwnerConfirmed = serverRole === 'owner';
  const hasAdminPanelAccess = isLoggedIn && (isModerator || isAdminRole || isOwner);

  const canManageModeration = isOwner || isAdminRole;
  const canManageAdmins = isOwner || isAdminRole;
  const canManageSystem = isOwnerConfirmed;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState({ users: 0, activeSessions: 0, activeWatchPartyRooms: 0, activeAnnouncements: 0, activeUsers: 0, activeGuests: 0, newUsersToday: 0 });
  const [bans, setBans] = useState<BannedItem[]>([]);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [blockedMedia, setBlockedMedia] = useState<BlockedMediaItem[]>([]);
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
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditNextOffset, setAuditNextOffset] = useState(0);
  const [isLoadingMoreAudit, setIsLoadingMoreAudit] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditAdminFilter, setAuditAdminFilter] = useState('');
  const [selectedFeedbackThreadId, setSelectedFeedbackThreadId] = useState<string | null>(null);
  const [feedbackInboxTab, setFeedbackInboxTab] = useState<'active' | 'archive'>('active');
  const [feedbackMessages, setFeedbackMessages] = useState<AdminFeedbackMessage[]>([]);
  const [selectedFeedbackThreadMeta, setSelectedFeedbackThreadMeta] = useState<{ status: 'open' | 'answered' | 'closed'; closedExpiresAt?: string; closedRemainingMs?: number } | null>(null);
  const [feedbackReply, setFeedbackReply] = useState('');

  const banType: 'username' = 'username';
  const [banValue, setBanValue] = useState('');
  const [banReason, setBanReason] = useState('');
  const [deleteUsername, setDeleteUsername] = useState('');
  const [blockedTmdbId, setBlockedTmdbId] = useState('');
  const [blockedMediaType, setBlockedMediaType] = useState<'movie' | 'tv'>('movie');
  const [blockedReason, setBlockedReason] = useState('');
  const [blockedSearch, setBlockedSearch] = useState('');
  const lookupType: 'username' = 'username';

  const filteredBlockedMedia = useMemo(() => {
    const query = blockedSearch.trim();
    if (!query) return blockedMedia;
    return blockedMedia.filter((item) =>
      item.tmdbId.includes(query) ||
      item.reason?.toLowerCase().includes(query.toLowerCase())
    );
  }, [blockedMedia, blockedSearch]);

  const filteredAuditLogs = useMemo(() => {
    const actionQuery = auditActionFilter.trim().toLowerCase();
    const adminQuery = auditAdminFilter.trim().toLowerCase();

    return auditLogs.filter((item) => {
      const actionMatch = actionQuery ? item.action.toLowerCase().includes(actionQuery) : true;
      const adminName = (item.adminUsername || item.adminUserId).toLowerCase();
      const adminMatch = adminQuery ? adminName.includes(adminQuery) : true;
      return actionMatch && adminMatch;
    });
  }, [auditLogs, auditActionFilter, auditAdminFilter]);

  const [lookupValue, setLookupValue] = useState('');

  const [message, setMessage] = useState('');
  const [announcementType, setAnnouncementType] = useState<AnnouncementType>('info');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');

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

  const sortedFeedbackThreads = useMemo(() => {
    const filtered = feedbackThreads.filter(t =>
      feedbackInboxTab === 'active' ? t.status !== 'closed' : t.status === 'closed'
    );
    return [...filtered].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [feedbackThreads, feedbackInboxTab]);

  const selectedFeedbackThread = useMemo(
    () => sortedFeedbackThreads.find((item) => item.id === selectedFeedbackThreadId) || null,
    [sortedFeedbackThreads, selectedFeedbackThreadId]
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

  const filteredAndSortedUsers = useMemo(() => {
    const nameFilter = userSearchQuery.trim().toLowerCase();

    const filtered = adminUsers.filter((u) => {
      return nameFilter ? u.username.toLowerCase().includes(nameFilter) : true;
    });

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
      setServerRole((overview.admin?.role as 'owner' | 'admin' | 'moderator' | null) || null);
      setStats({
        users: Number(overview.stats?.users || 0),
        activeSessions: Number(overview.stats?.activeSessions || 0),
        activeWatchPartyRooms: Number((overview.stats as any)?.activeWatchPartyRooms || 0),
        activeAnnouncements: Number(overview.stats?.activeAnnouncements || 0),
        activeUsers: Number(overview.stats?.activeUsers || 0),
        activeGuests: Number(overview.stats?.activeGuests || 0),
        newUsersToday: Number((overview.stats as any)?.newUsersToday || 0),
      });

      const promises: Promise<any>[] = [
        loadAdminUsers(),
        loadAdminFeedbackThreads(),
      ];

      if (canManageModeration) {
        promises.push(loadAdminBans());
        promises.push(loadAdminAnnouncements());
        promises.push(loadAdminAuditLogs({ limit: AUDIT_PAGE_SIZE, offset: 0 }));
        promises.push(loadAdminBlockedMedia());
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
        setAuditLogs(results[4].items || []);
        setAuditHasMore(Boolean(results[4].hasMore));
        setAuditNextOffset(Number(results[4].nextOffset || (results[4].items || []).length || 0));
        setBlockedMedia(results[5].items || []);
      }

      if (canManageAdmins) {
        const grantIndex = canManageModeration ? 6 : 2;
        if (results[grantIndex]) {
          setAdminGrants(results[grantIndex].items || []);
        }
      }

      const nextVisibleThreads = nextFeedbackThreads
        .filter((item: AdminFeedbackThread) => feedbackInboxTab === 'active' ? item.status !== 'closed' : item.status === 'closed')
        .sort((a: AdminFeedbackThread, b: AdminFeedbackThread) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

      if (!selectedFeedbackThreadId || !nextVisibleThreads.some((item: AdminFeedbackThread) => item.id === selectedFeedbackThreadId)) {
        setSelectedFeedbackThreadId(nextVisibleThreads[0]?.id || null);
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

  useEffect(() => {
    if (!canManage) return;

    if (sortedFeedbackThreads.length === 0) {
      if (selectedFeedbackThreadId !== null) setSelectedFeedbackThreadId(null);
      return;
    }

    if (!selectedFeedbackThreadId || !sortedFeedbackThreads.some((item) => item.id === selectedFeedbackThreadId)) {
      setSelectedFeedbackThreadId(sortedFeedbackThreads[0].id);
    }
  }, [sortedFeedbackThreads, selectedFeedbackThreadId, canManage]);

  const handleBanTarget = async () => {
    const value = banValue.trim();
    if (!value) {
      toast('Enter nickname or full user ID', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await banAdminTarget(banType, value, banReason.trim());
      setBanValue('');
      setBanReason('');
      await loadAll();
      toast('Account banned', 'success');
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
    const identifier = deleteUsername.trim();
    if (!identifier) {
      toast('Enter nickname or full user ID', 'error');
      return;
    }
    if (!confirm(`Delete user data for ${identifier}? This action cannot be undone.`)) return;

    setIsSubmitting(true);
    try {
      await deleteAdminUserByUsername(identifier);
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
    const identifier = deleteUsername.trim();
    if (!identifier) {
      toast('Enter nickname or full user ID first', 'error');
      return;
    }
    if (!confirm(`Reset password for ${identifier}? This will generate a temporary one.`)) return;

    setIsSubmitting(true);
    try {
      const res = await resetUserPassword(identifier);
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

  const handleClearAllSessions = async () => {
    if (!isOwnerConfirmed) {
      toast('Only owner can clear active sessions', 'error');
      return;
    }

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

  const handleClearUserSessions = async (userId: string, username: string) => {
    if (!isOwnerConfirmed) {
      toast('Only owner can clear user sessions', 'error');
      return;
    }

    const shouldClear = window.confirm(`Force logout all active sessions for "${username}"?`);
    if (!shouldClear) return;

    setIsSubmitting(true);
    try {
      const result = await clearUserActiveSessions(userId);
      toast(`Cleared ${result.clearedCount} active sessions for ${result.user.username}`, 'success');

      if (result.user.id === user?.id) {
        logout();
        window.location.href = '/login';
        return;
      }

      await loadAll();
    } catch (error: any) {
      toast(error?.message || 'Failed to clear user sessions', 'error');
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
        isActive: false, // Manual activation
      });
      setMessage('');
      setLinkUrl('');
      setLinkLabel('');
      setAnnouncementType('info');
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

  const handleBlockMedia = async () => {
    const tmdbId = blockedTmdbId.trim();
    if (!tmdbId) {
      toast('Enter TMDB ID', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await addAdminBlockedMedia(tmdbId, blockedMediaType, blockedReason.trim());
      setBlockedTmdbId('');
      setBlockedReason('');
      await loadAll();
      toast('Content blocked successfully', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to block content', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnblockMedia = async (tmdbId: string, mediaType: 'movie' | 'tv') => {
    setIsSubmitting(true);
    try {
      await deleteAdminBlockedMedia(tmdbId, mediaType as any);
      await loadAll();
      toast('Content unblocked successfully', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to unblock content', 'error');
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

  const handleArchiveFeedbackThread = async () => {
    if (!selectedFeedbackThreadId) {
      toast('Select a feedback thread first', 'error');
      return;
    }

    if (selectedFeedbackStatus === 'closed') {
      toast('This thread is already archived', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await replyAdminFeedbackThread({
        threadId: selectedFeedbackThreadId,
        message: FEEDBACK_ARCHIVE_MESSAGE,
        status: 'closed',
      });
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
      toast('Thread archived and user notified', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to archive feedback thread', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendFeedbackReply = async () => {
    if (!selectedFeedbackThreadId) {
      toast('Select a feedback thread first', 'error');
      return;
    }

    if (selectedFeedbackStatus === 'closed') {
      toast('Thread is archived. Unarchive it first.', 'warning');
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
        status: 'answered',
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
      toast('Reply sent', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to send reply', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnarchiveFeedbackThread = async () => {
    if (!selectedFeedbackThreadId) {
      toast('Select a feedback thread first', 'error');
      return;
    }

    if (!canManageModeration) {
      toast('Only admin+ can unarchive threads', 'error');
      return;
    }

    if (selectedFeedbackStatus !== 'closed') {
      toast('Thread is already active', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await replyAdminFeedbackThread({
        threadId: selectedFeedbackThreadId,
        message: FEEDBACK_UNARCHIVE_MESSAGE,
        status: 'open',
      });

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
      toast('Thread unarchived', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to unarchive thread', 'error');
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
    if (!isOwnerConfirmed) {
      toast('Only owner can force delete feedback threads', 'error');
      return;
    }

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
      toast('Feedback thread force deleted', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to force delete feedback thread', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoadMoreAuditLogs = async () => {
    if (!canManageModeration || !auditHasMore || isLoadingMoreAudit) return;

    setIsLoadingMoreAudit(true);
    try {
      const res = await loadAdminAuditLogs({ limit: AUDIT_PAGE_SIZE, offset: auditNextOffset });
      const incoming = res.items || [];

      setAuditLogs((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const uniqueIncoming = incoming.filter((item) => !existingIds.has(item.id));
        return [...prev, ...uniqueIncoming];
      });
      setAuditHasMore(Boolean(res.hasMore));
      setAuditNextOffset(Number(res.nextOffset || (auditNextOffset + incoming.length)));
    } catch (error: any) {
      toast(error?.message || 'Failed to load more audit logs', 'error');
    } finally {
      setIsLoadingMoreAudit(false);
    }
  };

  if (!hasAdminPanelAccess) {
    return (
      <div className="relative min-h-screen overflow-hidden pt-24 pb-12">
        <div className="mx-auto max-w-3xl px-4">
          <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-8 text-center relative border border-white/10">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-glass-light)] border border-red-500/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m14.5 9.5-5 5"/><path d="m9.5 9.5 5 5"/></svg>
            </div>
            <h1 className="text-[26px] font-bold text-text-primary tracking-tight">Access Denied</h1>
            <p className="mt-2 text-[14px] text-text-muted">You do not have the required permissions to access this panel.</p>
            <div className="mt-8 border-t border-white/5 pt-8">
               <Link href="/" className="btn-accent px-8">Return Home</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-10">
      <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16 space-y-6 relative [&_button]:text-center [&_button]:justify-center">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5 sm:p-6 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[30px] font-bold text-text-primary tracking-tight">Admin Console</h1>
              <span className="px-2 py-0.5 rounded-full bg-accent text-[11px] font-black uppercase tracking-widest text-white shadow-[0_0_10px_var(--accent-glow)]">{userRole}</span>
            </div>
            <p className="mt-1 text-[13px] text-text-muted max-w-xl">System overview and administrative controls for NexVid infrastructure.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => loadAll()} disabled={isLoading} className="btn-glass p-2.5 rounded-full" title="Refresh data">
              <svg className={cn("w-5 h-5", isLoading && "animate-spin")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
            {canManageSystem && (
              <button disabled={isSubmitting} onClick={handleClearAllSessions} className="btn-glass !text-red-400 px-4 font-bold border-red-500/20 hover:bg-red-500/10">
                Clear All Sessions
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Users" value={stats.users} />
          <StatCard
            label="Active Users"
            value={stats.activeUsers}
            isAccent
          />
          <StatCard label="Active Guests" value={stats.activeGuests} />
          <StatCard label="New Users Today" value={stats.newUsersToday} />
          <StatCard label="Cloud Sessions" value={stats.activeSessions} />
          <StatCard label="Party Rooms" value={stats.activeWatchPartyRooms} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
        {canManageModeration && (
          <>
            <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
              <h2 className="text-[15px] font-semibold text-text-primary">Moderation & account controls</h2>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm">
                  <h3 className="text-[13px] font-semibold text-text-primary">Account bans</h3>
                  <p className="text-[11px] text-text-muted">Ban an account.</p>
                  <input
                    className="input w-full"
                    placeholder="nickname or user ID"
                    value={banValue}
                    onChange={(e) => setBanValue(e.target.value)}
                  />
                  <input className="input w-full" placeholder="Reason (optional)" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
                  <button disabled={isSubmitting} onClick={handleBanTarget} className="btn-accent w-full">
                    Ban account
                  </button>
                  <div className="max-h-40 overflow-auto space-y-1.5 pt-1">
                    {bans.map((item) => (
                        <div key={`${item.type}:${item.value}`} className="rounded-[10px] p-2 bg-white/5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-text-primary break-all">
                                {item.type === 'ip' ? 'IP' : 'User'}: {item.value}
                              </p>
                              {item.userId && (
                                <p className="text-[10px] font-mono text-white/35 break-all">User ID: {item.userId}</p>
                              )}
                              {Array.isArray(item.linkedUserIds) && item.linkedUserIds.length > 0 && (
                                <p className="text-[10px] font-mono text-white/35 break-all">
                                  Linked IDs: {item.linkedUserIds.join(', ')}
                                </p>
                              )}
                              <p className="text-[10px] text-text-muted">
                                {item.reason ? `${item.reason} • ` : ''}{new Date(item.created_at).toLocaleString()}
                              </p>
                            </div>
                            <button
                              className="btn-glass text-red-400 text-[10px] shrink-0"
                              disabled={isSubmitting}
                              onClick={() => handleUnban(item.type, item.value)}
                            >
                              Unban
                            </button>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>

                <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 space-y-2 backdrop-blur-sm text-red-400/90 border border-red-500/10">
                  <h3 className="text-[13px] font-semibold">Danger Zone</h3>
                  <p className="text-[11px] text-red-400/60">Wipe account data permanently or reset password.</p>
                  <input className="input w-full border-red-500/20 focus:border-red-500/40" placeholder="nickname or user ID" value={deleteUsername} onChange={(e) => setDeleteUsername(e.target.value)} />
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
              </div>
            </section>

            <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
              <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Create announcement
              </h2>
              <textarea
                className={`input w-full resize-none break-all whitespace-pre-wrap ${announcementFontClass}`}
                placeholder="Write announcement message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={announcementRows}/>
              <div className="grid grid-cols-1 gap-2">
                <select
                  className="input w-full"
                  value={announcementType}
                  onChange={(e) => setAnnouncementType(e.target.value as AnnouncementType)}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="update">Update</option>
                  <option value="success">Success</option>
                </select>
              </div>

              <input className="input w-full" placeholder="Optional link URL (https://...)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <input className="input w-full" placeholder="Optional link label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={60} />

              <button disabled={isSubmitting} onClick={handleCreateAnnouncement} className="btn-accent w-full">
                Create announcement
              </button>
            </section>

            <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 xl:col-span-2">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                <div className="flex-1 rounded-[20px] bg-[var(--bg-glass-light)] p-5 backdrop-blur-sm">
                  <h2 className="text-[15px] font-semibold text-text-primary">Block content</h2>

                  <div className="mt-4 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold text-text-muted ml-1 mb-1 block">TMDB ID</label>
                        <input
                          className="input w-full min-h-[48px] text-[16px] text-text-primary bg-white/5 border-white/10 px-4 focus:bg-white/10"
                          placeholder="e.g. 550"
                          value={blockedTmdbId}
                          onChange={(e) => setBlockedTmdbId(e.target.value)}
                        />
                      </div>
                      <div className="w-full sm:w-32">
                        <label className="text-[10px] uppercase font-bold text-text-muted ml-1 mb-1 block">Type</label>
                        <select
                          className="input w-full min-h-[48px] text-text-primary bg-white/5"
                          value={blockedMediaType}
                          onChange={(e) => setBlockedMediaType(e.target.value as any)}
                        >
                          <option value="movie">Movie</option>
                          <option value="tv">Show</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-text-muted ml-1 mb-1 block">Reason (optional)</label>
                      <input
                        className="input w-full min-h-[48px] text-[15px] text-text-primary bg-white/5"
                        placeholder="Why is this blocked?"
                        value={blockedReason}
                        onChange={(e) => setBlockedReason(e.target.value)}
                      />
                    </div>
                    <button disabled={isSubmitting} onClick={handleBlockMedia} className="btn-accent w-full py-4 text-[15px] font-black uppercase tracking-widest shadow-[0_4px_20px_rgba(var(--accent-rgb),0.3)]">
                      Block Content
                    </button>
                  </div>
                </div>

                <div className="flex-1 rounded-[20px] bg-[var(--bg-glass-light)] p-5 backdrop-blur-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-[15px] font-semibold text-text-primary">Blocked IDs</h2>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <input
                        className="input w-full min-h-[44px] text-[13px] bg-white/5"
                        placeholder="Search by ID or reason"
                        value={blockedSearch}
                        onChange={(e) => setBlockedSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 max-h-[420px] overflow-auto space-y-2 border-t border-white/5 pt-4">
                    {isLoading ? (
                      <p className="text-[13px] text-text-muted">Loading...</p>
                    ) : filteredBlockedMedia.length === 0 ? (
                      <p className="text-[13px] text-text-muted">No blocked content.</p>
                    ) : (
                      filteredBlockedMedia.map((item) => (
                        <div key={`${item.mediaType}:${item.tmdbId}`} className="rounded-[12px] bg-[var(--bg-glass)] p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-text-primary">
                              <span className="uppercase text-[10px] text-accent font-bold mr-1">{item.mediaType}</span>
                              ID: {item.tmdbId}
                            </p>
                            <p className="text-[11px] text-text-muted truncate">{item.reason || 'No reason provided'}</p>
                            <p className="text-[10px] text-text-muted/60 mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</p>
                          </div>
                          <button
                            className="btn-glass text-red-400 text-[11px]"
                            disabled={isSubmitting}
                            onClick={() => handleUnblockMedia(item.tmdbId, item.mediaType as any)}
                          >
                            Unblock
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {canManageAdmins && (
        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Staff permissions</h2>
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
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <input
                className="input w-full py-1.5 px-3 text-[12px] bg-[var(--bg-glass-light)] border border-white/10 rounded-[8px] focus:bg-white/10 transition-all"
                placeholder="Nick search..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
              />
              {userSearchQuery && (
                <button onClick={() => setUserSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">×</button>
              )}
            </div>
            <select
              className="input"
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

        {/* Live Now Section */}
        {adminUsers.some(u => (Date.now() - new Date(u.lastActiveAt).getTime()) < 5 * 60 * 1000) && (
          <div className="rounded-[12px] bg-emerald-500/10 border border-emerald-500/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Live Now</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {adminUsers
                .filter(u => (Date.now() - new Date(u.lastActiveAt).getTime()) < 5 * 60 * 1000)
                .map(u => (
                  <span key={u.id} className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-medium border border-emerald-500/10">
                    {u.username}
                  </span>
                ))
              }
            </div>
          </div>
        )}

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
                {filteredAndSortedUsers.map((item) => {
                  const isLive = (Date.now() - new Date(item.lastActiveAt).getTime()) < 5 * 60 * 1000;
                  return (
                    <tr key={item.id} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3 text-text-primary font-medium">
                        <div className="flex items-center gap-2">
                          {item.username}
                          {isLive && (
                            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" title="Active in last 5m" />
                          )}
                        </div>
                      </td>
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
                      <td className="px-3 py-3 text-[12px] text-text-muted">
                        <span className={isLive ? 'text-emerald-400 font-medium' : ''}>
                          {new Date(item.lastActiveAt).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleCreateAdminChat(item.id, item.username)}
                            className="btn-glass text-[10px] py-1.5 px-3 bg-white/5 border-white/5 hover:bg-white/10"
                          >
                            Chat
                          </button>
                          {isOwnerConfirmed && (
                            <button
                              onClick={() => handleClearUserSessions(item.id, item.username)}
                              disabled={isSubmitting}
                              className="btn-glass text-[10px] py-1.5 px-3 text-amber-300 border-amber-500/20 hover:bg-amber-500/10"
                            >
                              Clear sessions
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {canManageModeration && (
        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Audit log</h2>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              className="input w-full"
              placeholder="Filter action..."
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
            />
            <input
              className="input w-full"
              placeholder="Filter admin..."
              value={auditAdminFilter}
              onChange={(e) => setAuditAdminFilter(e.target.value)}
            />
          </div>

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
                    <th className="px-3 py-2 font-medium sm:hidden">Details</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Target</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.map((item) => (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 text-text-muted whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-text-primary">{item.adminUsername || item.adminUserId.slice(0, 12)}</td>
                      <td className="px-3 py-2 text-text-muted">{item.action}</td>
                      <td className="px-3 py-2 text-text-muted sm:hidden">
                        <span className="block max-w-[180px] truncate">
                          {item.targetType}:{item.targetId || '-'} | {formatAuditMeta(item.meta)}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2 text-text-muted sm:table-cell">
                        <span className="block max-w-[320px] truncate">{formatAuditMeta(item.meta)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {auditHasMore && (
            <div className="pt-2">
              <button
                className="btn-glass w-full text-[12px]"
                disabled={isLoadingMoreAudit}
                onClick={handleLoadMoreAuditLogs}
              >
                {isLoadingMoreAudit ? 'Loading...' : `Load ${AUDIT_PAGE_SIZE} more`}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">Feedback inbox</h2>
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
                  <div>
                    <textarea
                      className="input min-h-12 max-h-32 w-full"
                      value={feedbackReply}
                      onChange={(event) => setFeedbackReply(event.target.value)}
                      placeholder={selectedFeedbackStatus === 'closed' ? 'Thread is archived. Unarchive to reply...' : 'Write message...'}
                      maxLength={4000}
                      rows={1}
                      disabled={selectedFeedbackStatus === 'closed'}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={isSubmitting || selectedFeedbackStatus === 'closed' || !feedbackReply.trim()}
                      onClick={handleSendFeedbackReply}
                      className="btn-accent flex-1 min-w-[92px] justify-center px-3 py-2 text-center text-[12px]"
                    >
                      Send
                    </button>
                    {selectedFeedbackStatus !== 'closed' ? (
                      <button
                        disabled={isSubmitting}
                        onClick={handleArchiveFeedbackThread}
                        className="btn-glass flex-1 min-w-[92px] justify-center px-3 py-2 text-center text-[12px] text-red-400 hover:bg-red-500/10"
                      >
                        Archive
                      </button>
                    ) : canManageModeration ? (
                      <button
                        disabled={isSubmitting}
                        onClick={handleUnarchiveFeedbackThread}
                        className="btn-glass flex-1 min-w-[92px] justify-center px-3 py-2 text-center text-[12px] text-emerald-400 hover:bg-emerald-500/10"
                      >
                        Unarchive
                      </button>
                    ) : (
                      <p className="self-center text-[11px] text-text-muted">Thread archived</p>
                    )}

                    {isOwnerConfirmed && (
                      <button
                        disabled={isSubmitting}
                        onClick={handleForceDeleteFeedbackThread}
                        className="btn-glass flex-1 min-w-[110px] justify-center px-3 py-2 text-center text-[12px] text-red-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
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
                <div key={item.id} className={cn(
                  "rounded-[18px] bg-white/[0.03] border p-4 flex flex-col justify-between gap-4 transition-all duration-300",
                  item.isActive ? "border-accent/40 shadow-[0_8px_32px_rgba(var(--accent-rgb),0.15)]" : "border-white/5"
                )}>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter",
                          item.type === 'info' ? "bg-accent/20 text-accent" :
                          item.type === 'warning' ? "bg-yellow-500/20 text-yellow-500" :
                          item.type === 'update' ? "bg-blue-500/20 text-blue-500" :
                          "bg-green-500/20 text-green-500"
                        )}>
                          {item.type}
                        </span>
                      </div>
                      {item.isActive && <span className="text-[9px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-black uppercase">Active</span>}
                    </div>
                    <p className="break-all whitespace-pre-wrap text-[13px] font-medium text-text-primary leading-relaxed">{item.message}</p>
                    <p className="text-[10px] text-white/20 mt-3 font-medium">{new Date(item.updatedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={cn("btn-glass flex-1 text-[11px] py-2", item.isActive && "bg-white/10")}
                      disabled={isSubmitting}
                      onClick={() => handleToggleAnnouncement(item)}
                    >
                      {item.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="btn-glass text-red-400 text-[11px] p-2"
                      disabled={isSubmitting}
                      onClick={() => handleDeleteAnnouncement(item.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
          <AdminSurveys canDelete={isOwnerConfirmed} />
        </section>
      )}
    </div>
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
