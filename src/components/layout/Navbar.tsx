/* ============================================
   Navigation – Floating macOS Pill (Top)
   ============================================ */

'use client';

import { AiAssistantModal } from '@/components/ui/AiAssistantModal';
import { loadPublicAnnouncements, loadUserNotifications, markUserNotificationsRead } from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Announcement {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'update' | 'success';
  link?: { url: string; label: string };
}

interface UserNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  threadId?: string;
  isRead: boolean;
  createdAt: string;
}

const ICONS: Record<Announcement['type'], React.ReactNode> = {
  info: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>,
  warning: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></svg>,
  update: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>,
  success: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
};

const TYPE_STYLES = {
  info: { icon: 'text-accent', bg: 'bg-accent/10' },
  warning: { icon: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  update: { icon: 'text-blue-500', bg: 'bg-blue-500/10' },
  success: { icon: 'text-green-500', bg: 'bg-green-500/10' },
};

function getDismissedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('nexvid-dismissed-announcements') || '[]'); } catch { return []; }
}
function dismissId(id: string) {
  const d = getDismissedIds();
  if (!d.includes(id)) { d.push(id); localStorage.setItem('nexvid-dismissed-announcements', JSON.stringify(d)); }
}

export function Navbar() {
  const WATCH_PARTY_CODE_KEY = 'nexvid-watch-party-code';

  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [partyCode, setPartyCode] = useState('');
  const [showProfilePartyInput, setShowProfilePartyInput] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const { user, isLoggedIn, logout } = useAuthStore();
  const { glassEffect } = useSettingsStore((s) => s.settings);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    const dismissed = getDismissedIds();

    const load = async () => {
      const [publicRes, userRes] = await Promise.all([
        loadPublicAnnouncements(),
        isLoggedIn ? loadUserNotifications().catch(() => ({ items: [] as UserNotification[] })) : Promise.resolve({ items: [] as UserNotification[] }),
      ]);
      if (!mounted) return;

      const activeAnnouncements = (publicRes.announcements || [])
        .filter((item: any) => !item.isImportant)
        .map((item: any) => ({ id: String(item.id), message: String(item.message || ''), type: (item.type || 'info') as Announcement['type'], link: item.link }))
        .filter((a: Announcement) => a.message)
        .filter((a: Announcement) => !dismissed.includes(a.id));

      const userNotifications = (userRes.items || []).map((item: any) => ({
        id: String(item.id), type: String(item.type || 'info'), title: String(item.title || 'Notification'),
        message: String(item.message || ''), threadId: item.threadId ? String(item.threadId) : undefined,
        isRead: Boolean(item.isRead), createdAt: String(item.createdAt || ''),
      }));

      setAnnouncements(activeAnnouncements);
      setNotifications(userNotifications);
    };

    load();
    return () => { mounted = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isSearchOpen && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') { setIsSearchOpen(false); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dockRef.current) return;
      if (!dockRef.current.contains(event.target as Node)) {
        setIsBellOpen(false);
        setIsProfileOpen(false);
        setShowProfilePartyInput(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleWatchPartyJoin = () => {
    if (!isLoggedIn) return;
    const normalized = partyCode.trim().toUpperCase();
    if (!normalized) return;

    try {
      localStorage.setItem(WATCH_PARTY_CODE_KEY, normalized);
    } catch {}

    setShowProfilePartyInput(false);
    setPartyCode(normalized);
    router.push(`/browse?party=${encodeURIComponent(normalized)}`);
  };

  const isWatchPage = pathname?.startsWith('/watch');
  if (!mounted) return null;
  if (isWatchPage) return null;

  const unreadNotifications = notifications.filter((item) => !item.isRead && item.type !== 'feedback_reply');
  const hasUnreadFeedback = notifications.some((item) => !item.isRead && item.type === 'feedback_reply');
  const totalNotifCount = announcements.length + unreadNotifications.length;

  const dockItems = [
    { href: '/', id: 'home', label: 'Home', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )},
    { href: '/browse', id: 'browse', label: 'Browse', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
      </svg>
    )},
    { href: '/list', id: 'list', label: 'My List', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    )},
  ];

  const DockIcon = ({ item, isButton }: { item: typeof dockItems[0]; isButton?: boolean }) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));

    const content = (
      <div className="relative flex flex-col items-center">
        {/* Icon container */}
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-[14px] transition-all duration-500 ease-[var(--spring)] sm:h-12 sm:w-12 sm:rounded-[16px]',
            isActive
              ? 'bg-accent/20 text-accent shadow-[0_0_20px_var(--accent-glow)]'
              : 'text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110',
          )}
        >
          {item.icon}
        </div>
      </div>
    );

    if (isButton) return content;

    return (
      <Link href={item.href} className="flex flex-col items-center" aria-label={item.label}>
        {content}
      </Link>
    );
  };

  return (
    <>
      <AiAssistantModal isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />

      {/* ── Search Overlay ── */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-2xl animate-fade-in" onClick={() => setIsSearchOpen(false)}>
          <div className="w-full max-w-xl mx-4 animate-slide-down" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSearch}>
              <div className="relative">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <label htmlFor="search-input" className="sr-only">Search movies and shows</label>
                <input
                  ref={searchRef}
                  id="search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search movies, shows..."
                  className="w-full h-16 rounded-[24px] bg-white/[0.06] backdrop-blur-[40px] shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)] pl-14 pr-14 text-[17px] text-white placeholder:text-white/25 outline-none focus:shadow-[0_0_40px_var(--accent-muted),0_0_0_1px_var(--accent-muted)] transition-all duration-500"
                  autoFocus
                />
                <kbd className="absolute right-5 top-1/2 -translate-y-1/2 text-[11px] text-white/20 font-mono bg-white/[0.06] px-2 py-1 rounded-[8px] shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)]">ESC</kbd>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Floating Pill (Top) ── */}
      <nav ref={dockRef} className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div
          className={cn(
            'flex max-w-[calc(100vw-16px)] items-center gap-0.5 rounded-[24px] px-2 py-1.5 sm:gap-1 sm:rounded-[28px] sm:px-3 sm:py-2 transition-all duration-500',
            glassEffect
              ? 'bg-black/60 backdrop-blur-[40px] backdrop-saturate-[180%] shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_0.5px_rgba(255,255,255,0.06)]'
              : 'bg-black/90 shadow-[0_8px_40px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.04)]',
          )}
        >
          {/* Nav Links */}
          {dockItems.map((item) => (
            <DockIcon key={item.id} item={item} />
          ))}

          {/* AI Assistant */}
          {isLoggedIn && (
            <button
              onClick={() => setIsAiOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-[14px] text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110 transition-all duration-500 ease-[var(--spring)] sm:h-12 sm:w-12 sm:rounded-[16px]"
              aria-label="AI Assistant"
            >
              <div className="relative flex flex-col items-center">
                <div className={cn(
                  "transition-all duration-500",
                  isAiOpen ? "text-accent scale-110" : ""
                )}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.2 1.3L3.1 12l5.8 1.9a2 2 0 0 1 1.3 1.2L12 20.9l1.9-5.8a2 2 0 0 1 1.2-1.3l5.8-1.9-5.8-1.9a2 2 0 0 1-1.3-1.2L12 3Z" />
                    <path d="M7 5H3" /><path d="M5 3v4" />
                  </svg>
                </div>
              </div>
            </button>
          )}

          {/* Divider */}
          <div className="mx-1 hidden h-8 w-px bg-white/[0.08] sm:block" />

          {/* Search */}
          <button
            onClick={() => {
              setIsSearchOpen(true);
              setTimeout(() => searchRef.current?.focus(), 100);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-[14px] text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110 transition-all duration-500 ease-[var(--spring)] sm:h-12 sm:w-12 sm:rounded-[16px]"
            aria-label="Search (press /)"
          >
            <div className="relative flex flex-col items-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
          </button>

          {/* Notifications */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => { setIsBellOpen((v) => !v); setIsProfileOpen(false); }}
              className="relative flex h-12 w-12 items-center justify-center rounded-[16px] text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110 transition-all duration-500"
              aria-label="Notifications"
            >
              <div className="relative flex flex-col items-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {totalNotifCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" />
                )}
                </div>

            </button>

            {isBellOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsBellOpen(false)} />
                <div className="fixed top-[88px] left-1/2 z-50 w-80" style={{ transform: 'translateX(-50%)' }}>
                  <div className="panel-glass w-full overflow-hidden animate-scale-in">
                <div className="px-4 py-3">
                  <p className="text-[13px] font-semibold text-white">Notifications</p>
                </div>
                {notifications.length === 0 && announcements.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-white/20 mb-2">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    <p className="text-[11px] text-white/30">All caught up</p>
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                    {notifications.filter(n => n.type !== 'feedback_reply').map((item) => (
                      <button
                        key={item.id}
                        onClick={async () => {
                          if (!item.isRead) {
                            try { await markUserNotificationsRead([item.id]); } catch {}
                            setNotifications((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
                          }
                          if (item.threadId) { router.push(`/contact?thread=${encodeURIComponent(item.threadId)}`); setIsBellOpen(false); }
                        }}
                        className={cn(
                          'w-full flex items-start gap-2.5 rounded-[14px] px-3 py-2.5 text-left transition-all duration-300',
                          item.isRead ? 'hover:bg-white/[0.06]' : 'bg-accent/10 hover:bg-accent/15',
                        )}
                      >
                        <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', item.isRead ? 'bg-white/[0.06]' : 'bg-accent/15')}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-white line-clamp-1">{item.title}</p>
                          <p className="mt-0.5 text-[11px] text-white/40 line-clamp-2 leading-relaxed">{item.message}</p>
                        </div>
                        {!item.isRead && <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" />}
                      </button>
                    ))}

                    {announcements.map((a) => {
                      const styles = TYPE_STYLES[a.type] || TYPE_STYLES.info;
                      return (
                        <div key={a.id} className="group relative flex items-start gap-3 rounded-[16px] bg-white/[0.03] p-3.5 border border-white/[0.05] transition-all duration-300 hover:bg-white/[0.06]">
                          <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", styles.bg)}>
                            <div className={cn("text-accent", styles.icon)}>
                              {ICONS[a.type] || ICONS.info}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="break-words whitespace-pre-wrap text-[13px] leading-relaxed text-white/90 font-medium">
                              {a.message}
                            </p>
                            {a.link && (
                              <a
                                href={a.link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1.5 inline-flex items-center text-[12px] font-semibold text-accent hover:underline decoration-2 underline-offset-2"
                              >
                                {a.link.label}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="ml-1 opacity-70"><path d="M7 17l10-10M7 7h10v10"/></svg>
                              </a>
                            )}
                          </div>
                          <button
                            onClick={() => { dismissId(a.id); setAnnouncements((prev) => prev.filter((x) => x.id !== a.id)); }}
                            className="absolute top-2.5 right-2.5 rounded-full p-1.5 opacity-0 group-hover:opacity-100 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all duration-300"
                            title="Dismiss"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>
              </>
            )}
          </div>
          <Link
            href="/settings"
            className="flex h-10 w-10 items-center justify-center rounded-[14px] text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110 transition-all duration-500 sm:h-12 sm:w-12 sm:rounded-[16px]"
            aria-label="Settings"
          >
            <div className="relative flex flex-col items-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
          </Link>

          {/* Logged in direct actions */}
          {isLoggedIn && (
            <>
              <div className="mx-0.5 h-6 w-px bg-white/[0.08]" />

              {user?.isAdmin && (
                <Link
                  href="/admin"
                  className="flex h-10 w-10 items-center justify-center rounded-[14px] text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110 transition-all duration-500 sm:h-12 sm:w-12"
                  aria-label="Admin"
                >
                  <div className="relative flex flex-col items-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                </Link>
              )}

              <Link
                href="/contact"
                className="flex h-10 w-10 items-center justify-center rounded-[14px] text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110 transition-all duration-500 sm:h-12 sm:w-12"
                aria-label="Contact"
              >
                <div className="relative flex flex-col items-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {hasUnreadFeedback && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" />
                  )}
                </div>
              </Link>

              <button
                onClick={() => { setShowProfilePartyInput(!showProfilePartyInput); setIsBellOpen(false); }}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-[14px] transition-all duration-500 sm:h-12 sm:w-12 hover:scale-110",
                  showProfilePartyInput ? "bg-accent/20 text-accent" : "text-white/40 hover:text-white/80 hover:bg-white/[0.08]"
                )}
                aria-label="Watch Together"
              >
                <div className="relative flex flex-col items-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4s-3 1.57-3 3.5 1.34 3.5 3 3.5z" />
                    <path d="M8 11c1.66 0 3-1.57 3-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11z" />
                    <path d="M2 20v-1c0-2.2 2.69-4 6-4" /><path d="M22 20v-1c0-2.2-2.69-4-6-4" />
                    <path d="M8 20v-1c0-2.2 1.79-4 4-4s4 1.8 4 4v1" />
                  </svg>
                </div>
              </button>

              {showProfilePartyInput && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfilePartyInput(false)} />
                  <div className="fixed top-[88px] left-1/2 z-50 w-64 -translate-x-1/2">
                    <div className="panel-glass p-3 animate-scale-in">
                      <p className="text-[13px] font-semibold text-white mb-2">Join Watch Together</p>
                      <label htmlFor="party-code-input" className="sr-only">Room code</label>
                      <input
                        id="party-code-input"
                        value={partyCode}
                        onChange={(e) => setPartyCode(e.target.value.toUpperCase())}
                        placeholder="Room code"
                        className="w-full rounded-[10px] bg-white/[0.08] px-3 py-2 text-[12px] text-white placeholder:text-white/35 outline-none mb-2"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleWatchPartyJoin(); }}
                        autoFocus
                      />
                      <button
                        onClick={handleWatchPartyJoin}
                        disabled={!partyCode.trim()}
                        className="w-full rounded-[10px] bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-95"
                      >
                        Join Room
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Divider */}
          <div className="mx-1 h-8 w-px bg-white/[0.08]" />

          {/* Auth Button */}
          {isLoggedIn ? (
            <button
              onClick={() => logout()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all duration-500 hover:scale-110 sm:h-11 sm:w-11"
              aria-label="Log Out"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center rounded-[14px] bg-accent p-2.5 text-[12px] font-semibold text-white shadow-[0_0_24px_var(--accent-glow)] hover:bg-accent-hover hover:shadow-[0_0_40px_var(--accent-glow)] hover:scale-105 active:scale-95 transition-all duration-500 sm:gap-2 sm:rounded-[16px] sm:px-5 sm:py-2.5 sm:text-[13px]"
              aria-label="Sign In"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:mr-1" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <span className="hidden sm:inline">Sign In</span>
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
