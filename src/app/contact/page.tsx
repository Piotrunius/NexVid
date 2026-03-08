'use client';

import { toast } from '@/components/ui/Toaster';
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

export default function ContactPage() {
  const { isLoggedIn } = useAuthStore();
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
      });
      setSubject('');
      setMessage('');
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
          <Link href="/login" className="btn-accent mt-5 inline-flex">Go to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-12 space-y-6">
      <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5">
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Contact & Feedback</h1>
        <p className="mt-1 text-[13px] text-text-muted">Report bugs, send feedback, or contact support. Admin replies appear here and in notifications.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-4">
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

          <button disabled={isSubmitting} onClick={handleCreateThread} className="btn-accent w-full">
            Send message
          </button>
        </section>

        <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 xl:col-span-2">
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="rounded-[12px] bg-[var(--bg-glass-light)] p-2 max-h-[560px] overflow-auto backdrop-blur-sm">
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
                        <p className="mt-1 text-[10px] text-red-500">Archive auto-delete in {formatRemaining(thread.closedRemainingMs)}</p>
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
                      <p className="mt-1 text-[11px] font-semibold text-red-500">
                        Archived (read-only). Auto-delete in {formatRemaining(selectedClosedRemainingMs)}
                        {selectedClosedExpiresAt ? ` · ${new Date(selectedClosedExpiresAt).toLocaleString()}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex-1 min-h-0 space-y-2 overflow-auto pr-1">
                    {messages.length === 0 ? (
                      <p className="text-[13px] text-text-muted">No messages yet.</p>
                    ) : (
                      messages.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'max-w-[90%] rounded-[12px] px-3 py-2.5 text-[13px] leading-relaxed',
                            item.senderRole === 'admin'
                              ? 'bg-accent/10 text-text-primary'
                              : 'bg-[var(--bg-glass-light)] text-text-secondary ml-auto'
                          )}
                        >
                          <p className="text-[11px] font-semibold mb-1 opacity-80">{item.senderRole === 'admin' ? 'Admin' : 'You'}</p>
                          <p className="whitespace-pre-wrap">{item.message}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 border-t border-[var(--border)] pt-3 space-y-2">
                    <textarea
                      className="input min-h-24 w-full"
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder={isSelectedClosed ? 'Thread is closed (read-only archive)' : 'Write a reply...'}
                      maxLength={4000}
                      disabled={isSelectedClosed || isSubmitting}
                    />
                    <button disabled={isSubmitting || isSelectedClosed} onClick={handleReply} className="btn-glass w-full">
                      Send reply
                    </button>
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
