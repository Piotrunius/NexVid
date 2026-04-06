'use client';

import { toast } from '@/components/ui/Toaster';
import { Turnstile } from '@/components/ui/Turnstile';
import {
    createUserFeedbackThread,
    loadUserFeedbackMessages,
    loadUserFeedbackThreads,
    loadUserNotifications,
    markUserNotificationsRead,
    sendUserFeedbackMessage,
} from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type FeedbackThread = {
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
};

type FeedbackMessage = {
  id: string;
  senderRole: 'user' | 'admin';
  message: string;
  createdAt: string;
};

const CATEGORY_OPTIONS = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'feature', label: 'Feature request' },
  { value: 'contact', label: 'Contact' },
] as const;

const DISCORD_INVITE_URL = 'https://cloud.umami.is/q/vCu19Bcub';

export default function ContactPage() {
  const { isLoggedIn } = useAuthStore();
  const [hasTurnstile, setHasTurnstile] = useState(true);
  const [threadIdFromQuery, setThreadIdFromQuery] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [threads, setThreads] = useState<FeedbackThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [selectedThreadMeta, setSelectedThreadMeta] = useState<{ status: 'open' | 'answered' | 'closed'; closedExpiresAt?: string; closedRemainingMs?: number } | null>(null);

  const [category, setCategory] = useState<FeedbackThread['category']>('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [feedbackTurnstileToken, setFeedbackTurnstileToken] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const selectedStatus = selectedThreadMeta?.status || selectedThread?.status || 'open';
  const selectedClosedExpiresAt = selectedThreadMeta?.closedExpiresAt || selectedThread?.closedExpiresAt;
  const selectedClosedRemainingMs = selectedThreadMeta?.closedRemainingMs ?? selectedThread?.closedRemainingMs;
  const isSelectedClosed = selectedStatus === 'closed';

  const formatRemaining = (milliseconds?: number) => {
    if (!milliseconds || milliseconds <= 0) return 'less than 1 hour';
    const totalMinutes = Math.ceil(milliseconds / (1000 * 60));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    return `${Math.max(1, hours)}h`;
  };

  const loadThreads = async (keepSelection = true) => {
    if (!isLoggedIn) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await loadUserFeedbackThreads();
      const next = (res.items || []).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      setThreads(next);

      if (!keepSelection || !selectedThreadId || !next.some((thread) => thread.id === selectedThreadId)) {
        setSelectedThreadId(next[0]?.id || null);
      }

      if (selectedThreadId) {
        const selected = next.find((thread) => thread.id === selectedThreadId);
        if (selected) {
          setSelectedThreadMeta({
            status: selected.status,
            closedExpiresAt: selected.closedExpiresAt,
            closedRemainingMs: selected.closedRemainingMs,
          });
        }
      }
    } catch (error: any) {
      toast(error?.message || 'Failed to load contact threads', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (threadId: string) => {
    try {
      const res = await loadUserFeedbackMessages(threadId);
      setMessages(res.items || []);
      if (res.thread) {
        setSelectedThreadMeta({
          status: res.thread.status,
          closedExpiresAt: res.thread.closedExpiresAt,
          closedRemainingMs: res.thread.closedRemainingMs,
        });
      }
    } catch (error: any) {
      toast(error?.message || 'Failed to load thread messages', 'error');
      setMessages([]);
      setSelectedThreadMeta(null);
    }
  };

  useEffect(() => {
    if (!selectedThreadId || !isLoggedIn) return;

    const pollInterval = setInterval(() => {
      loadUserFeedbackMessages(selectedThreadId)
        .then(res => setMessages(res.items || []))
        .catch(() => {});
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [selectedThreadId, isLoggedIn]);

  useEffect(() => {
    loadThreads(false);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      setSelectedThreadMeta(null);
      return;
    }
    loadMessages(selectedThreadId);
  }, [selectedThreadId]);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('thread')?.trim() || null;
    setThreadIdFromQuery(value);
  }, []);

  useEffect(() => {
    if (!threadIdFromQuery) return;
    if (!threads.some((thread) => thread.id === threadIdFromQuery)) return;
    if (selectedThreadId === threadIdFromQuery) return;
    setSelectedThreadId(threadIdFromQuery);
  }, [threadIdFromQuery, threads, selectedThreadId]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const markFeedbackNotificationsRead = async () => {
      try {
        const notifications = await loadUserNotifications();
        const unreadFeedbackReplyIds = (notifications.items || [])
          .filter((item) => !item.isRead && item.type === 'feedback_reply')
          .map((item) => item.id);

        if (unreadFeedbackReplyIds.length > 0) {
          await markUserNotificationsRead(unreadFeedbackReplyIds);
        }
      } catch {
        // notifications are non-blocking here
      }
    };

    markFeedbackNotificationsRead();
  }, [isLoggedIn]);

  const handleCreateThread = async () => {
    const subjectValue = subject.trim();
    const messageValue = message.trim();

    if (!subjectValue) {
      toast('Subject is required', 'error');
      return;
    }
    if (!messageValue) {
      toast('Message is required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createUserFeedbackThread({
        category,
        subject: subjectValue,
        message: messageValue,
      }, feedbackTurnstileToken);
      setSubject('');
      setMessage('');
      setFeedbackTurnstileToken(null);
      toast('Message sent', 'success');
      await loadThreads(false);
      if (result.id) {
        setSelectedThreadId(result.id);
      }
    } catch (error: any) {
      toast(error?.message || 'Failed to send message', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!selectedThreadId) return;
    const body = replyText.trim();
    if (!body) {
      toast('Reply cannot be empty', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendUserFeedbackMessage(selectedThreadId, body);
      setReplyText('');
      await Promise.all([loadMessages(selectedThreadId), loadThreads(true)]);
      toast('Reply sent', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to send reply', 'error');
      await Promise.all([loadMessages(selectedThreadId), loadThreads(true)]);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-24 pb-12">
        <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-glass-light)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </div>
          <h1 className="text-[22px] font-bold text-text-primary tracking-tight">Contact & Feedback</h1>
          <p className="mt-2 text-[13px] text-text-muted">Sign in to send bug reports, feedback and contact messages.</p>
          <div className="mt-6 border-t border-[var(--border)] pt-6">
            <p className="text-[12px] text-text-muted">Or contact us directly via email:</p>
            <a href="mailto:support@nexvid.online" className="mt-1 block text-[14px] font-medium text-accent hover:underline">support@nexvid.online</a>
            <p className="mt-4 text-[12px] text-text-muted">Prefer chat? Join our Discord server:</p>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-[14px] font-medium text-accent hover:underline"
            >
              Join Discord
            </a>
          </div>
          <Link href="/login" className="btn-accent mt-6 inline-flex">Go to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-12 space-y-6">
      <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Contact & Feedback</h1>
          <p className="mt-1 text-[13px] text-text-muted">Report bugs, send feedback, or contact support. Admin replies appear here and in notifications.</p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2 text-[12px] text-text-muted">
            <span>Support:</span>
            <a href="mailto:support@nexvid.online" className="font-medium text-accent hover:underline">support@nexvid.online</a>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-text-muted">
            <span>Security:</span>
            <a href="mailto:security@nexvid.online" className="font-medium text-accent hover:underline">security@nexvid.online</a>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-text-muted">
            <span>Community:</span>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              Join Discord
            </a>
          </div>
        </div>
      </div>

      <div className="grid items-stretch gap-6 xl:grid-cols-3">
        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4 h-full xl:min-h-[680px]">
          <h2 className="text-[15px] font-semibold text-text-primary">New message</h2>

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Category</p>
            <select className="input w-full" value={category} onChange={(event) => setCategory(event.target.value as FeedbackThread['category'])}>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Subject</p>
            <input
              className="input w-full"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Short title..."
              maxLength={120}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Message</p>
            <textarea
              className="input min-h-32 w-full"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the issue or feedback..."
              maxLength={4000}
            />
          </div>

          {hasTurnstile && <Turnstile onVerify={setFeedbackTurnstileToken} onAvailabilityChange={setHasTurnstile} />}

          <button disabled={isSubmitting || (hasTurnstile && !feedbackTurnstileToken)} onClick={handleCreateThread} className="btn-accent w-full">
            Send message
          </button>
        </section>

        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 xl:col-span-2 h-full xl:min-h-[680px]">
          <div className="grid h-full gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-2 h-[70vh] min-h-[420px] max-h-[680px] overflow-auto backdrop-blur-sm">
              <p className="px-2 py-1 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Your threads</p>
              {isLoading ? (
                <p className="px-2 py-4 text-[13px] text-text-muted">Loading...</p>
              ) : threads.length === 0 ? (
                <p className="px-2 py-4 text-[13px] text-text-muted">No threads yet.</p>
              ) : (
                <div className="space-y-1">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={cn(
                        'w-full rounded-[8px] px-2.5 py-2 text-left transition-all',
                        selectedThreadId === thread.id
                          ? 'border-accent/30 bg-accent/10 shadow-[0_1px_6px_var(--accent-glow)]'
                          : 'border-transparent hover:bg-[var(--bg-glass-light)]'
                      )}
                    >
                      <p className="text-[12px] font-medium text-text-primary line-clamp-1">{thread.subject}</p>
                      <p className="mt-0.5 text-[11px] text-text-muted">{thread.category} · {thread.status === 'answered' ? 'resolved' : thread.status}</p>
                      {thread.status === 'closed' && (
                        <p className="mt-1 text-[10px] text-red-500/80 font-medium">Archived · Visible for 14 days</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-3 min-h-[420px] h-[70vh] max-h-[680px] overflow-hidden flex flex-col backdrop-blur-sm">
              {!selectedThread ? (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-glass-light)]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  </div>
                  <p className="text-[13px] text-text-muted">Select a thread to view messages</p>
                </div>
              ) : (
                <>
                  <div className="border-b border-[var(--border)] pb-2">
                    <p className="text-[13px] font-semibold text-text-primary line-clamp-1">{selectedThread.subject}</p>
                    <p className="mt-0.5 text-[11px] text-text-muted">{selectedThread.category} · {selectedStatus === 'answered' ? 'resolved by admin' : selectedStatus}</p>
                    {selectedStatus === 'answered' && <p className="mt-1 text-[11px] font-semibold text-emerald-500">Marked as resolved</p>}
                    {selectedStatus === 'closed' && (
                      <p className="mt-1 text-[11px] font-semibold text-red-500/80">
                        Archived thread (read-only) · Visible for 14 days after closing
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex-1 min-h-0 space-y-3 overflow-auto pr-1">
                    {messages.length === 0 ? (
                      <p className="text-[13px] text-text-muted">No messages yet.</p>
                    ) : (
                      messages.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "flex flex-col gap-1",
                            item.senderRole === 'user' ? "items-end" : "items-start"
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
                            {item.senderRole === 'admin' ? 'Support' : 'You'} · {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <div className="flex gap-2">
                      <textarea
                        className="input min-h-12 max-h-32 flex-1"
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder={isSelectedClosed ? 'Thread is archived' : 'Write message...'}
                        maxLength={4000}
                        disabled={isSelectedClosed || isSubmitting}
                        rows={1}
                      />
                      <button
                        disabled={isSubmitting || isSelectedClosed || !replyText.trim()}
                        onClick={handleReply}
                        className="btn-accent px-5 shrink-0"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
