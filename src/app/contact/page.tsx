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
import { LIMITS } from '@/lib/validation';
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

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_URL;

export default function ContactPage() {
  const { isLoggedIn } = useAuthStore();
  const [hasTurnstile, setHasTurnstile] = useState(true);
  const [threadIdFromQuery, setThreadIdFromQuery] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [threads, setThreads] = useState<FeedbackThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [selectedThreadMeta, setSelectedThreadMeta] = useState<{
    status: 'open' | 'answered' | 'closed';
    closedExpiresAt?: string;
    closedRemainingMs?: number;
  } | null>(null);

  const [category, setCategory] = useState<FeedbackThread['category']>('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [feedbackTurnstileToken, setFeedbackTurnstileToken] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId],
  );

  const selectedStatus = selectedThreadMeta?.status || selectedThread?.status || 'open';
  const selectedClosedExpiresAt =
    selectedThreadMeta?.closedExpiresAt || selectedThread?.closedExpiresAt;
  const selectedClosedRemainingMs =
    selectedThreadMeta?.closedRemainingMs ?? selectedThread?.closedRemainingMs;
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
      const next = (res.items || []).sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      );
      setThreads(next);

      if (
        !keepSelection ||
        !selectedThreadId ||
        !next.some((thread) => thread.id === selectedThreadId)
      ) {
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
        .then((res) => setMessages(res.items || []))
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

    if (subjectValue.length < LIMITS.FEEDBACK_SUBJECT_MIN) {
      toast(`Subject must be at least ${LIMITS.FEEDBACK_SUBJECT_MIN} characters`, 'error');
      return;
    }
    if (messageValue.length < LIMITS.FEEDBACK_MESSAGE_MIN) {
      toast(`Message must be at least ${LIMITS.FEEDBACK_MESSAGE_MIN} characters`, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createUserFeedbackThread(
        {
          category,
          subject: subjectValue,
          message: messageValue,
        },
        feedbackTurnstileToken,
      );
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
    if (body.length < LIMITS.FEEDBACK_REPLY_MIN) {
      toast(`Reply must be at least ${LIMITS.FEEDBACK_REPLY_MIN} characters`, 'error');
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
      <div className="relative min-h-screen overflow-hidden pt-24 pb-12">
        <div className="mx-auto max-w-3xl px-4">
          <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-8 text-center relative">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-glass-light)] border border-white/5">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text-muted"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h1 className="text-[26px] font-bold text-text-primary tracking-tight">
              Contact & Feedback
            </h1>
            <p className="mt-2 text-[14px] text-text-muted">
              Sign in to send bug reports, feedback and contact messages.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-8">
              <div className="p-4 rounded-[16px] bg-white/[0.03] border border-white/5 text-left">
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Direct Email
                </p>
                <a
                  href="mailto:support@nexvid.online"
                  className="text-[14px] font-medium text-accent hover:underline"
                >
                  support@nexvid.online
                </a>
              </div>
              <div className="p-4 rounded-[16px] bg-white/[0.03] border border-white/5 text-left">
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Community
                </p>
                <a
                  href={DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[14px] font-medium text-accent hover:underline"
                >
                  Join Discord Server
                </a>
              </div>
            </div>

            <Link href="/login" className="btn-accent mt-8 inline-flex items-center gap-2">
              Go to login
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14m-7-7 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-12">
      <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16 space-y-6 relative">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5 sm:p-6 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-[30px] font-bold text-text-primary tracking-tight">
              Contact & Feedback
            </h1>
            <p className="mt-1 text-[13px] text-text-muted max-w-lg">
              Report bugs, send feedback, or contact support. Admin replies appear here.
            </p>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-3">
          <div className="space-y-5">
            <section className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 space-y-5">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4 bg-accent rounded-full" />
                  <h2 className="text-[15px] font-semibold text-text-primary">Send a message</h2>
                </div>

                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">Category</p>
                  <select
                    className="input w-full bg-white/[0.04] border-white/10"
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as FeedbackThread['category'])
                    }
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">Subject</p>
                  <input
                    className="input w-full bg-white/[0.04] border-white/10"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Short, descriptive title..."
                    minLength={LIMITS.FEEDBACK_SUBJECT_MIN}
                    maxLength={LIMITS.FEEDBACK_SUBJECT_MAX}
                  />
                </div>

                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">Message</p>
                  <textarea
                    className="input min-h-[110px] w-full bg-white/[0.04] border-white/10 resize-none"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Describe your issue or feedback in detail..."
                    minLength={LIMITS.FEEDBACK_MESSAGE_MIN}
                    maxLength={LIMITS.FEEDBACK_MESSAGE_MAX}
                  />
                </div>

                {hasTurnstile && (
                  <div className="py-1">
                    <Turnstile
                      onVerify={setFeedbackTurnstileToken}
                      onAvailabilityChange={setHasTurnstile}
                    />
                  </div>
                )}

                <button
                  disabled={isSubmitting || (hasTurnstile && !feedbackTurnstileToken)}
                  onClick={handleCreateThread}
                  className="btn-accent w-full flex items-center justify-center gap-2 py-3"
                >
                  {isSubmitting ? (
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                  )}
                  Send message
                </button>
              </div>

              <div className="pt-3 border-t border-white/5 space-y-2">
                <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                  Support Directory
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-text-muted">Support:</span>
                    <a
                      href="mailto:support@nexvid.online"
                      className="text-accent hover:underline font-medium"
                    >
                      support@nexvid.online
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-text-muted">Security:</span>
                    <a
                      href="mailto:security@nexvid.online"
                      className="text-accent hover:underline font-medium"
                    >
                      security@nexvid.online
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-text-muted">Discord:</span>
                    <a
                      href={DISCORD_INVITE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline font-medium"
                    >
                      Community Hub
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="glass-card glass-liquid rounded-[var(--glass-radius-lg)] p-5 xl:col-span-2">
            <div className="grid h-full gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
              <div className="rounded-[20px] bg-white/[0.03] border border-white/5 p-3 h-[70vh] min-h-[420px] max-h-[680px] overflow-auto backdrop-blur-sm">
                <p className="px-3 py-2 text-[11px] font-bold text-text-muted uppercase tracking-widest border-b border-white/5 mb-3">
                  Your Activity
                </p>
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <svg className="animate-spin h-5 w-5 text-text-muted" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                ) : threads.length === 0 ? (
                  <div className="px-3 py-10 text-center">
                    <p className="text-[13px] text-text-muted">No messages yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {threads.map((thread) => (
                      <button
                        key={thread.id}
                        onClick={() => setSelectedThreadId(thread.id)}
                        className={cn(
                          'w-full rounded-[14px] px-4 py-3 text-left transition-all duration-200 border',
                          selectedThreadId === thread.id
                            ? 'bg-accent/15 border-accent/30 shadow-[0_4px_12px_var(--accent-glow)]'
                            : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10',
                        )}
                      >
                        <p
                          className={cn(
                            'text-[13px] font-semibold line-clamp-1',
                            selectedThreadId === thread.id ? 'text-accent' : 'text-text-primary',
                          )}
                        >
                          {thread.subject}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/5 text-text-muted capitalize">
                            {thread.category}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] font-bold uppercase tracking-tighter',
                              thread.status === 'answered'
                                ? 'text-emerald-400'
                                : thread.status === 'closed'
                                  ? 'text-text-muted'
                                  : 'text-blue-400',
                            )}
                          >
                            {thread.status === 'answered' ? 'resolved' : thread.status}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[20px] bg-white/[0.03] border border-white/5 p-4 min-h-[420px] h-[70vh] max-h-[680px] overflow-hidden flex flex-col backdrop-blur-sm">
                {!selectedThread ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.03] border border-white/5">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-text-muted"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <p className="text-[14px] text-text-muted font-medium">
                      Select a thread to view the conversation
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-white/10 pb-4 mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-[15px] font-bold text-text-primary line-clamp-1">
                          {selectedThread.subject}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={cn(
                              'text-[10px] font-black uppercase px-2 py-0.5 rounded-full',
                              selectedStatus === 'answered'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : selectedStatus === 'closed'
                                  ? 'bg-white/10 text-text-muted'
                                  : 'bg-blue-500/10 text-blue-400',
                            )}
                          >
                            {selectedStatus === 'answered' ? 'resolved' : selectedStatus}
                          </span>
                          <span className="text-[11px] text-text-muted">
                            {selectedThread.category} thread
                          </span>
                        </div>
                      </div>
                      {selectedStatus === 'closed' && (
                        <div className="bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
                          <p className="text-[10px] text-red-400 font-bold uppercase">Archived</p>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-h-0 space-y-4 overflow-auto pr-2 custom-scrollbar">
                      {messages.length === 0 ? (
                        <p className="text-[13px] text-text-muted text-center py-10">
                          Starting conversation...
                        </p>
                      ) : (
                        messages.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              'flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300',
                              item.senderRole === 'user' ? 'items-end' : 'items-start',
                            )}
                          >
                            <div
                              className={cn(
                                'max-w-[85%] rounded-[20px] px-5 py-3 text-[13.5px] shadow-lg border',
                                item.senderRole === 'admin'
                                  ? 'bg-accent border-white/20 text-white rounded-tr-[4px] shadow-[0_4px_15px_rgba(var(--accent-rgb),0.3)]'
                                  : 'bg-white/[0.05] border-white/10 text-white/95 rounded-tl-[4px]',
                              )}
                            >
                              <p className="whitespace-pre-wrap leading-relaxed">{item.message}</p>
                            </div>
                            <div className="flex items-center gap-2 px-1">
                              <p className="text-[10px] text-white/40 font-bold uppercase tracking-tight">
                                {item.senderRole === 'admin' ? 'Support Agent' : 'You'}
                              </p>
                              <span className="text-white/20 text-[10px]">•</span>
                              <p className="text-[10px] text-white/40">
                                {new Date(item.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/10">
                      <div className="flex items-end gap-3 glass-card bg-white/[0.02] p-1.5 rounded-[22px] border-white/5">
                        <textarea
                          className={cn(
                            'input min-h-[50px] max-h-32 flex-1 !bg-transparent !border-0 !shadow-none !ring-0 py-3 px-4 resize-none text-[14px]',
                            isSelectedClosed && 'opacity-50',
                          )}
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          placeholder={
                            isSelectedClosed
                              ? 'This conversation has been archived.'
                              : 'Type your reply here...'
                          }
                          minLength={LIMITS.FEEDBACK_REPLY_MIN}
                          maxLength={LIMITS.FEEDBACK_REPLY_MAX}
                          disabled={isSelectedClosed || isSubmitting}
                          rows={1}
                          onKeyDown={(e) => {
                            if (
                              e.key === 'Enter' &&
                              !e.shiftKey &&
                              replyText.trim() &&
                              !isSubmitting &&
                              !isSelectedClosed
                            ) {
                              e.preventDefault();
                              handleReply();
                            }
                          }}
                        />
                        <button
                          disabled={isSubmitting || isSelectedClosed || !replyText.trim()}
                          onClick={handleReply}
                          className="btn-accent !rounded-full p-3.5 mb-1 shrink-0 aspect-square flex items-center justify-center"
                          title="Send Message"
                        >
                          {isSubmitting ? (
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                          ) : (
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M22 2 11 13" />
                              <path d="m22 2-7 20-4-9-9-4 20-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {isSelectedClosed && (
                        <p className="text-[11px] text-center text-text-muted mt-2">
                          Closed threads are visible for 14 days and cannot be reopened.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
