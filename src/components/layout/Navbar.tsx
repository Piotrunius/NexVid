/* ============================================
   Navigation – Floating macOS Pill (Top)
   ============================================ */

'use client';

import { AiAssistantModal } from '@/components/ui/AiAssistantModal';
import { loadPublicAnnouncements, loadUserNotifications } from '@/lib/cloudSync';
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
  info: { icon: 'text-accent', bg: 'bg-transparent' },
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
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [hasUnreadSupportReply, setHasUnreadSupportReply] = useState(false);
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const { user, isLoggedIn, logout } = useAuthStore();
  const { glassEffect, groqApiKey } = useSettingsStore((s) => s.settings);

  const hasOwnAiKey = groqApiKey && groqApiKey !== '__PUBLIC_GROQ_KEY__';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    const dismissed = getDismissedIds();

    const load = async () => {
      const publicRes = await loadPublicAnnouncements();
      if (!mounted) return;

      const activeAnnouncements = (publicRes.announcements || [])
        .filter((item: any) => !item.isImportant)
        .map((item: any) => ({ id: String(item.id), message: String(item.message || ''), type: (item.type || 'info') as Announcement['type'], link: item.link }))
        .filter((a: Announcement) => a.message)
        .filter((a: Announcement) => !dismissed.includes(a.id));

      setAnnouncements(activeAnnouncements);
    };

    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setHasUnreadSupportReply(false);
      return;
    }

    let isCancelled = false;

    const syncSupportUnread = async () => {
      try {
        const res = await loadUserNotifications();
        if (isCancelled) return;
        const hasUnread = (res.items || []).some((item) => !item.isRead && item.type === 'feedback_reply');
        setHasUnreadSupportReply(hasUnread);
      } catch {
        if (!isCancelled) setHasUnreadSupportReply(false);
      }
    };

    syncSupportUnread();
    const interval = setInterval(syncSupportUnread, 10000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isLoggedIn, pathname]);

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
        setIsProfileOpen(false);
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

  const isWatchPage = pathname?.startsWith('/watch');
  if (!mounted) return null;
  if (isWatchPage) return null;

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

  const iconContainerBase = 'flex items-center justify-center rounded-[12px] transition-all duration-500 ease-[var(--spring)] min-w-0';
  const iconSize = 'h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10';

  const DockIcon = ({ item, isButton }: { item: typeof dockItems[0]; isButton?: boolean }) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));

    const content = (
      <div className="relative flex flex-col items-center flex-1 min-w-0 basis-0">
        {/* Icon container */}
        <div
          className={cn(
            `${iconContainerBase} ${iconSize}`,
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
      <Link href={item.href} className="flex flex-col items-center flex-1 min-w-0 basis-0" aria-label={item.label}>
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
            'flex max-w-[calc(100vw-16px)] items-center gap-0.5 rounded-[24px] px-2 py-1.5 sm:gap-1 sm:rounded-[28px] sm:px-3 sm:py-2 transition-all duration-500 overflow-x-auto snap-x snap-mandatory touch-pan-x',
            glassEffect
              ? 'bg-black/60 backdrop-blur-[40px] backdrop-saturate-[180%] shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_0.5px_rgba(255,255,255,0.06)]'
              : 'bg-black/90 shadow-[0_8px_40px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.04)]',
          )}
        >
          {/* Nav Links */}
          {dockItems.map((item) => (
            <DockIcon key={item.id} item={item} />
          ))}

          {/* Search */}
          <button
            onClick={() => {
              setIsSearchOpen(true);
              setTimeout(() => searchRef.current?.focus(), 100);
            }}
            className="flex flex-col items-center flex-1 min-w-0 basis-0"
            aria-label="Search (press /)"
          >
            <div className={cn(`${iconContainerBase} ${iconSize}`, 'text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110')}>
              <div className="relative flex flex-col items-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </div>
            </div>
          </button>

          {/* Divider */}
          <div className="mx-1 hidden h-8 w-px bg-white/[0.08] sm:block" />

          {/* AI Assistant */}
          {(isLoggedIn || hasOwnAiKey) && (
            <button
              onClick={() => setIsAiOpen(true)}
              className="flex flex-col items-center flex-1 min-w-0 basis-0"
              aria-label="AI Assistant"
            >
              <div className={cn(`${iconContainerBase} ${iconSize}`, 'text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110')}>
                <div className={cn(
                  "relative flex flex-col items-center transition-all duration-500",
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

          {/* Settings always visible */}
          <Link
            href="/settings"
            className="flex flex-col items-center flex-1 min-w-0 basis-0"
            aria-label="Settings"
          >
            <div className={cn(`${iconContainerBase} ${iconSize}`, 'text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110')}>
              <div className="relative flex flex-col items-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Contact only when logged in */}
          {isLoggedIn && (
            <Link
              href="/contact"
              className="flex flex-col items-center flex-1 min-w-0 basis-0"
              aria-label="Contact"
            >
              <div className={cn(`${iconContainerBase} ${iconSize}`, 'text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110')}>
                <div className="relative flex flex-col items-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {hasUnreadSupportReply && pathname !== '/contact' && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent-glow)]" />
                  )}
                </div>
              </div>
            </Link>
          )}

          {/* Only admin is additional */}
          {isLoggedIn && user?.isAdmin && (
            <>
              <Link
                href="/admin"
                className="flex flex-col items-center flex-1 min-w-0 basis-0"
                aria-label="Admin"
              >
                <div className={cn(`${iconContainerBase} ${iconSize}`, 'text-white/40 hover:text-white/80 hover:bg-white/[0.08] hover:scale-110')}>
                  <div className="relative flex flex-col items-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                </div>
              </Link>
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
