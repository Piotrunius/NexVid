/* ============================================
   Navigation – Floating macOS Pill (Top)
   ============================================ */

'use client';

import { AiAssistantModal } from '@/components/ui/AiAssistantModal';
import { loadPublicAnnouncements, loadUserNotifications } from '@/lib/cloudSync';
import { normalizeMediaType } from '@/lib/mediaType';
import { searchMedia } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useBlockedContentStore } from '@/stores/blockedContent';
import { useSettingsStore } from '@/stores/settings';
import type { MediaItem } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Announcement {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'update' | 'success';
  link?: { url: string; label: string };
}

const ICONS: Record<Announcement['type'], React.ReactNode> = {
  info: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
  warning: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  update: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  ),
  success: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
};

const TYPE_STYLES = {
  info: { icon: 'text-accent', bg: 'bg-transparent' },
  warning: { icon: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  update: { icon: 'text-blue-500', bg: 'bg-blue-500/10' },
  success: { icon: 'text-green-500', bg: 'bg-green-500/10' },
};

function getDismissedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('nexvid-dismissed-announcements') || '[]');
  } catch {
    return [];
  }
}
function dismissId(id: string) {
  const d = getDismissedIds();
  if (!d.includes(id)) {
    d.push(id);
    localStorage.setItem('nexvid-dismissed-announcements', JSON.stringify(d));
  }
}

export function Navbar() {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchType, setSearchType] = useState<'all' | 'movie' | 'tv'>('all');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [hasUnreadSupportReply, setHasUnreadSupportReply] = useState(false);
  const [mounted, setMounted] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const { user, isLoggedIn, logout } = useAuthStore();
  const { isBlocked } = useBlockedContentStore();
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
        .map((item: any) => ({
          id: String(item.id),
          message: String(item.message || ''),
          type: (item.type || 'info') as Announcement['type'],
          link: item.link,
        }))
        .filter((a: Announcement) => a.message)
        .filter((a: Announcement) => !dismissed.includes(a.id));

      setAnnouncements(activeAnnouncements);
    };

    load();
    return () => {
      mounted = false;
    };
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
        const hasUnread = (res.items || []).some(
          (item) => !item.isRead && item.type === 'feedback_reply',
        );
        setHasUnreadSupportReply(hasUnread);
      } catch {
        if (!isCancelled) setHasUnreadSupportReply(false);
      }
    };

    syncSupportUnread();
    const interval = setInterval(syncSupportUnread, 180000); // Poll every 3 minutes instead of 10s

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isLoggedIn]); // Removed pathname dependency to prevent re-polling on every navigation

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !isSearchOpen &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
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

  useEffect(() => {
    if (!isSearchOpen) return;

    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setHasSearched(true);
      try {
        const { results } = await searchMedia(query, 1, searchType);
        if (cancelled) return;

        const filtered = results.filter((item) => !isBlocked(item.tmdbId, item.mediaType));

        setSearchResults(filtered.slice(0, 12));
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isBlocked, isSearchOpen, searchQuery, searchType]);

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setHasSearched(false);
    setSearchType('all');
  };

  const isWatchPage = pathname?.startsWith('/watch');
  const isSettingsActive = pathname === '/settings' || pathname?.startsWith('/settings/');
  const isContactActive = pathname === '/contact' || pathname?.startsWith('/contact/');
  const isAdminActive = pathname === '/admin' || pathname?.startsWith('/admin/');
  if (!mounted) return null;
  if (isWatchPage) return null;

  const dockItems = [
    {
      href: '/',
      id: 'home',
      label: 'Home',
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      href: '/browse',
      id: 'browse',
      label: 'Browse',
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      href: '/list',
      id: 'list',
      label: 'My List',
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ];

  const iconContainerBase =
    'flex items-center justify-center rounded-[12px] transition-all duration-500 ease-[var(--spring)] transform-gpu min-w-0';
  const iconSize = 'h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10';
  const navActiveClass = 'text-accent drop-shadow-[0_0_14px_var(--accent-glow)]';
  const navIdleClass = 'text-white/40 hover:text-white/80 hover:bg-white/[0.08]';
  const modalActiveClass = 'text-accent drop-shadow-[0_0_14px_var(--accent-glow)]';

  const DockIcon = ({ item, isButton }: { item: (typeof dockItems)[0]; isButton?: boolean }) => {
    const isActive =
      pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));

    const content = (
      <div className="relative flex min-w-0 flex-1 basis-0 flex-col items-center">
        {/* Icon container */}
        <div
          className={cn(
            `${iconContainerBase} ${iconSize}`,
            isActive ? navActiveClass : navIdleClass,
          )}
        >
          {item.icon}
        </div>
      </div>
    );

    if (isButton) return content;

    return (
      <Link
        href={item.href}
        className="flex min-w-0 flex-1 basis-0 flex-col items-center"
        aria-label={item.label}
      >
        {content}
      </Link>
    );
  };

  return (
    <>
      <AiAssistantModal isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />

      {/* ── Search Overlay ── */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-md"
            onClick={closeSearch}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-45%' }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-45%' }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed left-1/2 top-1/2 z-[61] w-full max-w-[min(96vw,900px)] p-3 outline-none sm:p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={cn(
                  'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.65)] transition-all',
                  glassEffect
                    ? 'bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_40%,rgba(0,0,0,0.35)_100%)] backdrop-blur-2xl'
                    : 'bg-[#050608]/95',
                )}
              >
                <div className="relative z-10 flex shrink-0 items-center justify-between bg-black/25 px-5 py-4 sm:px-6">
                  <div className="flex flex-col">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                      <Search className="h-5 w-5 text-accent" />
                      Search
                    </h2>
                    <p className="mt-0.5 text-[11px] text-white/45">Curated results as you type</p>
                  </div>
                  <button
                    onClick={closeSearch}
                    className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="Close search modal"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="custom-scrollbar flex-1 overflow-y-scroll">
                  <div className="px-5 pt-4 sm:px-6">
                    <form className="group relative" onSubmit={(e) => e.preventDefault()}>
                      <div className="relative">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 transition-colors group-focus-within:text-accent"
                          aria-hidden="true"
                        >
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                        </svg>
                        <label htmlFor="search-input" className="sr-only">
                          Search movies and shows
                        </label>
                        <input
                          ref={searchRef}
                          id="search-input"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search movies, shows..."
                          className="focus:border-accent/45 h-12 w-full appearance-none rounded-xl border border-transparent bg-white/5 pl-11 pr-16 text-sm text-white shadow-inner outline-none transition-all placeholder:text-white/20 focus:outline-none focus:ring-0"
                          autoFocus
                        />
                        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-white/5 px-2 py-1 font-mono text-[10px] text-white/25">
                          ESC
                        </kbd>
                      </div>
                    </form>
                  </div>

                  <div className="mt-4 overflow-x-auto px-5 sm:px-6">
                    <div className="inline-flex items-center rounded-full bg-white/[0.05] p-1">
                      {(
                        [
                          { key: 'all', label: 'All' },
                          { key: 'movie', label: 'Movies' },
                          { key: 'tv', label: 'TV Shows' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSearchType(item.key)}
                          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] font-black uppercase tracking-wider outline-none transition-all ${searchType === item.key ? 'border-accent-glow bg-accent-muted text-accent' : 'border-transparent bg-transparent text-white/40 hover:text-white'}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative grid min-h-[300px] gap-3 p-5 sm:p-6">
                    {searchResults.length > 0 ? (
                      <div className="grid gap-3 sm:gap-4">
                        {searchResults.map((item) => {
                          const itemType = normalizeMediaType(item.mediaType);
                          const href =
                            itemType === 'movie' ? `/movie/${item.tmdbId}` : `/show/${item.tmdbId}`;
                          return (
                            <div
                              key={`${item.mediaType}-${item.tmdbId}`}
                              className="group w-full min-w-0 rounded-2xl bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06]"
                            >
                              <Link
                                href={href}
                                onClick={closeSearch}
                                className="flex w-full min-w-0 flex-col gap-4 sm:flex-row"
                              >
                                <div className="relative mx-auto aspect-[2/3] w-full max-w-[120px] shrink-0 overflow-hidden rounded-xl bg-black/40 shadow-2xl sm:mx-0 sm:w-24 sm:max-w-[160px]">
                                  {item.posterPath ? (
                                    <img
                                      src={`https://image.tmdb.org/t/p/w200${item.posterPath}`}
                                      alt={item.title}
                                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs font-bold uppercase text-white/20">
                                      {item.title}
                                    </div>
                                  )}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                                  <div>
                                    <div className="flex items-start justify-between gap-2">
                                      <h3 className="truncate pr-2 text-base font-extrabold leading-tight text-white sm:text-lg">
                                        {item.title}
                                      </h3>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-1">
                                      <span className="text-xs font-bold text-white/30">
                                        {item.releaseYear || 'N/A'}
                                      </span>
                                      <div className="h-0.5 w-0.5 rounded-full bg-white/10" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                                        {itemType === 'movie' ? 'Movie' : 'TV Show'}
                                      </span>
                                    </div>
                                    <p className="mt-3 line-clamp-2 text-sm font-medium leading-relaxed text-white/50 sm:mt-2">
                                      {item.overview?.trim() || 'No description available yet.'}
                                    </p>
                                  </div>
                                </div>
                                <div className="ml-auto flex items-center gap-1 text-xs font-black text-yellow-500">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                  >
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                  </svg>
                                  <span>{item.rating.toFixed(1)}</span>
                                </div>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    ) : isSearching ? (
                      <div className="rounded-2xl bg-white/[0.03] px-5 py-6 text-sm text-white/55">
                        Searching...
                      </div>
                    ) : hasSearched ? (
                      <div className="rounded-2xl bg-white/[0.03] px-5 py-6 text-sm text-white/55">
                        No results. Try a different phrase.
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-white/[0.03] px-5 py-6 text-sm text-white/55">
                        Start typing to search instantly.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Pill (Top) ── */}
      <nav ref={dockRef} className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
        <div
          className={cn(
            'flex max-w-[calc(100vw-16px)] touch-pan-x snap-x snap-mandatory items-center gap-0.5 overflow-x-auto rounded-[24px] px-2 py-1.5 transition-all duration-500 sm:gap-1 sm:rounded-[28px] sm:px-3 sm:py-2',
            glassEffect
              ? 'bg-black/60 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_0.5px_rgba(255,255,255,0.06)] backdrop-blur-[40px] backdrop-saturate-[180%]'
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
            className="flex min-w-0 flex-1 basis-0 flex-col items-center"
            aria-label="Search (press /)"
          >
            <div
              className={cn(
                `${iconContainerBase} ${iconSize}`,
                isSearchOpen ? modalActiveClass : navIdleClass,
              )}
            >
              <div className="relative flex flex-col items-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
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
              className="flex min-w-0 flex-1 basis-0 flex-col items-center"
              aria-label="AI Assistant"
            >
              <div
                className={cn(
                  `${iconContainerBase} ${iconSize}`,
                  isAiOpen ? modalActiveClass : navIdleClass,
                )}
              >
                <div
                  className={cn(
                    'relative flex flex-col items-center transition-all duration-500',
                    isAiOpen ? 'text-accent' : '',
                  )}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.2 1.3L3.1 12l5.8 1.9a2 2 0 0 1 1.3 1.2L12 20.9l1.9-5.8a2 2 0 0 1 1.2-1.3l5.8-1.9-5.8-1.9a2 2 0 0 1-1.3-1.2L12 3Z" />
                    <path d="M7 5H3" />
                    <path d="M5 3v4" />
                  </svg>
                </div>
              </div>
            </button>
          )}

          {/* Settings always visible */}
          <Link
            href="/settings"
            className="flex min-w-0 flex-1 basis-0 flex-col items-center"
            aria-label="Settings"
          >
            <div
              className={cn(
                `${iconContainerBase} ${iconSize}`,
                isSettingsActive ? navActiveClass : navIdleClass,
              )}
            >
              <div className="relative flex flex-col items-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
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
              className="flex min-w-0 flex-1 basis-0 flex-col items-center"
              aria-label="Contact"
            >
              <div
                className={cn(
                  `${iconContainerBase} ${iconSize}`,
                  isContactActive ? navActiveClass : navIdleClass,
                )}
              >
                <div className="relative flex flex-col items-center">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
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
                className="flex min-w-0 flex-1 basis-0 flex-col items-center"
                aria-label="Admin"
              >
                <div
                  className={cn(
                    `${iconContainerBase} ${iconSize}`,
                    isAdminActive ? navActiveClass : navIdleClass,
                  )}
                >
                  <div className="relative flex flex-col items-center">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
              className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-red-400 transition-all duration-500 hover:scale-110 hover:bg-red-500/20 sm:h-11 sm:w-11"
              aria-label="Log Out"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          ) : (
            <Link
              href="/login"
              className="hover:bg-accent/20 flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-accent-glow bg-accent-muted px-3 py-2 text-[11px] font-black uppercase tracking-wider text-accent transition-all sm:px-4 sm:py-2"
              aria-label="Sign In"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="sm:mr-0.5"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="hidden sm:inline">Sign In</span>
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
