/* ============================================
   Media Card – Sequoia Glassmorphism
   ============================================ */

'use client';

import { cn, formatTime, tmdbImage } from '@/lib/utils';
import { useWatchlistStore } from '@/stores/watchlist';
import type { MediaItem, WatchlistStatus } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface MediaCardProps {
  item: MediaItem;
  size?: 'sm' | 'md' | 'lg';
  showType?: boolean;
}

const STATUSES: WatchlistStatus[] = ['Planned', 'Watching', 'Completed', 'Dropped', 'On-Hold'];

function formatRelativeTime(dateString: string): string {
  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function StatusIcon({ status }: { status: WatchlistStatus }) {
  switch (status) {
    case 'Planned':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case 'Watching':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'Completed':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>;
    case 'Dropped':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case 'On-Hold':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>;
  }
}

export function MediaCard({ item, size = 'md', showType = false }: MediaCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const watchlistItem = useWatchlistStore((s) => s.getByTmdbId(item.tmdbId));
  const progress = watchlistItem?.progress;
  const hasProgress = mounted && progress && (progress.percentage || 0) > 0.1;
  const isShow = item.mediaType === 'show' || watchlistItem?.mediaType === 'show';

  const defaultHref = item.mediaType === 'movie' ? `/movie/${item.tmdbId}` : `/show/${item.tmdbId}`;

  const watchUrl = hasProgress
    ? `/watch/${item.mediaType || watchlistItem?.mediaType}/${item.tmdbId}?s=${progress.season || 1}&e=${progress.episode || 1}&t=${progress.timestamp || 0}`
    : defaultHref;

  const href = hasProgress ? watchUrl : defaultHref;
  const [showMenu, setShowMenu] = useState(false);
  const { addItem, setStatus: setWatchlistStatus } = useWatchlistStore();

  const handleWatchlistClick = (e: React.MouseEvent, status: WatchlistStatus) => {
    e.preventDefault();
    e.stopPropagation();
    if (watchlistItem) {
      setWatchlistStatus(watchlistItem.id, status);
    } else {
      addItem({ mediaType: item.mediaType, tmdbId: item.tmdbId, title: item.title, posterPath: item.posterPath, status });
    }
    setShowMenu(false);
  };

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu((v) => !v);
  };

  const sizeClasses = { sm: 'w-[140px]', md: 'w-[180px]', lg: 'w-[220px]' };

  return (
    <Link href={href} className={cn('media-card group media-grid-item', sizeClasses[size])}>
      <div className="relative overflow-hidden rounded-[24px] aspect-[2/3] bg-black shadow-[0_4px_24px_rgba(0,0,0,0.6)] group-hover:shadow-[0_12px_48px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.1)] transition-all duration-600 ease-[var(--spring)]">
        {item.posterPath ? (
          <Image
            src={tmdbImage(item.posterPath, size === 'lg' ? 'w500' : 'w342')}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-700 ease-[var(--spring)] group-hover:scale-[1.08]"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-white/15">
              <rect x="2" y="2" width="20" height="20" rx="2" /><path d="m10 8 6 4-6 4z" />
            </svg>
          </div>
        )}

        {/* Progress Bar */}
        {hasProgress && progress && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40 backdrop-blur-md">
            <div
              className="h-full bg-accent shadow-[0_0_12px_var(--accent-glow)] transition-all duration-1000"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        )}

        {/* Hover overlay - Simplified */}
        <div className="media-card-overlay">
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
             <div className="h-12 w-12 rounded-full bg-accent/90 text-white flex items-center justify-center shadow-[0_0_20px_var(--accent-glow)] transform scale-90 group-hover:scale-100 transition-transform duration-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
             </div>
          </div>
        </div>

        {/* Watchlist Button */}
        {mounted && (
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-400 z-10">
            <div className="relative">
              <button
                onClick={handleToggleMenu}
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-[12px] backdrop-blur-[20px] transition-all duration-400 ease-[var(--spring)] active:scale-90',
                  watchlistItem
                    ? 'bg-accent/80 text-white shadow-[0_0_16px_var(--accent-glow)]'
                    : 'bg-black/40 text-white/80 hover:bg-black/60',
                )}
                title={watchlistItem ? watchlistItem.status : 'Add to List'}
              >
                {watchlistItem ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                )}
              </button>
              {showMenu && (
                <div className="panel-glass absolute bottom-full right-0 mb-2 w-36 p-1.5 z-20 animate-scale-in">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      onClick={(e) => handleWatchlistClick(e, status)}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] capitalize transition-all duration-300',
                        watchlistItem?.status === status
                          ? 'bg-accent/15 text-accent font-medium'
                          : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80',
                      )}
                    >
                      <StatusIcon status={status} />
                      {status.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rating badge */}
        {!hasProgress && item.rating > 0 && (
          <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-[20px] px-2 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="text-[10px] font-bold text-white">{item.rating}</span>
          </div>
        )}

        {/* Type badge */}
        {showType && (
          <div className="absolute top-3 left-3 rounded-full bg-accent/85 px-2.5 py-1 backdrop-blur-[20px] shadow-[0_0_16px_var(--accent-glow)]">
            <span className="text-[10px] font-bold uppercase text-white tracking-[0.12em]">
              {item.mediaType === 'movie' ? 'Movie' : 'TV'}
            </span>
          </div>
        )}
      </div>

      {/* Title below card - Enhanced Info */}
      <div className="mt-3 px-1 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold text-white/90 line-clamp-1 flex-1 tracking-tight">{item.title}</p>
          {hasProgress && progress && (
             <span className="text-[10px] font-black text-accent tracking-tighter bg-accent/10 px-1.5 py-0.5 rounded-md">
                {Math.round(progress.percentage || 0)}%
             </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] font-medium">
          <p className="text-white/30">
            {mounted && watchlistItem?.updatedAt ? formatRelativeTime(watchlistItem.updatedAt) : item.releaseYear}
          </p>
          {hasProgress && progress && (
             <p className="text-white/50 tracking-wide font-bold">
                {isShow ? `S${progress.season}:E${progress.episode}` : formatTime(progress.timestamp || 0)}
             </p>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ============================================
   Media Row (Horizontal Scroll)
   ============================================ */

interface MediaRowProps {
  title: React.ReactNode;
  items: MediaItem[];
  href?: string;
  showType?: boolean;
  enableControls?: boolean;
  seeAllAsButton?: boolean;
  noPadding?: boolean;
  noHeader?: boolean;
  seeAllLabel?: string;
}

export function MediaRow({
  title,
  items,
  href,
  showType,
  enableControls = false,
  seeAllAsButton = false,
  noPadding = false,
  noHeader = false,
  seeAllLabel = "See All"
}: MediaRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    if (!enableControls) return;
    const row = rowRef.current;
    if (!row) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScrollLeft = row.scrollWidth - row.clientWidth;
    setCanScrollLeft(row.scrollLeft > 4);
    setCanScrollRight(maxScrollLeft > 4 && row.scrollLeft < maxScrollLeft - 4);
  };

  const scrollRow = (direction: 'left' | 'right') => {
    const row = rowRef.current;
    if (!row) return;
    const delta = Math.max(280, row.clientWidth * 0.75);
    row.scrollBy({ left: direction === 'left' ? -delta : delta, behavior: 'smooth' });
  };

  useLayoutEffect(() => {
    if (!rowRef.current) return;
    rowRef.current.scrollTo({ left: 0, behavior: 'auto' });
    updateScrollState();
  }, [title, items.length]);

  useEffect(() => {
    if (!enableControls) return;
    const row = rowRef.current;
    if (!row) return;

    updateScrollState();
    const onScroll = () => updateScrollState();
    const onResize = () => updateScrollState();

    row.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      row.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [enableControls, items.length, title]);

  return (
    <section className={cn(noPadding ? "py-2" : "py-8")}>
      {!noHeader && (
        <div className={cn("flex items-center justify-between px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto", noPadding ? "mb-3" : "mb-5")}>
          <div className="flex-1 min-w-0 mr-4">
            {typeof title === 'string' ? (
              <h2 className="text-[20px] font-semibold text-white tracking-tight truncate">{title}</h2>
            ) : (
              title
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {enableControls && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => scrollRow('left')}
                  disabled={!canScrollLeft}
                  aria-label={`Scroll left`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-all duration-300 hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <button
                  onClick={() => scrollRow('right')}
                  disabled={!canScrollRight}
                  aria-label={`Scroll right`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-all duration-300 hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            )}
            {href && (
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-1 transition-all duration-300',
                  seeAllAsButton
                    ? 'rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/[0.12] hover:text-white'
                    : 'text-[13px] font-medium text-accent/70 hover:text-accent',
                )}
              >
                {seeAllLabel}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </Link>
            )}
          </div>
        </div>
      )}
      <div ref={rowRef} className="scroll-row home-scroll-row px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
        {items.map((item, index) => (
          <MediaCard key={`${item.mediaType}-${item.id}-${item.tmdbId}-${index}`} item={item} showType={showType} />
        ))}
      </div>
    </section>
  );
}

/* ============================================
   Skeleton Loading
   ============================================ */

export function MediaCardSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'w-[140px]', md: 'w-[180px]', lg: 'w-[220px]' };

  return (
    <div className={cn('media-grid-item flex-shrink-0', sizeClasses[size])}>
      <div className="skeleton rounded-[24px] aspect-[2/3] w-full" />
      <div className="mt-3 space-y-2 px-1">
        <div className="skeleton h-3.5 w-3/4 rounded-[8px]" />
        <div className="skeleton h-3 w-1/3 rounded-[8px]" />
      </div>
    </div>
  );
}

export function MediaRowSkeleton({
  title,
  count = 6,
  size = 'md',
  noPadding = false,
}: {
  title?: string;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  noPadding?: boolean;
}) {
  return (
    <section className={cn(noPadding ? 'py-2' : 'py-8')}>
      <div className="mb-5 px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
        {title ? (
          <h2 className="text-[20px] font-semibold text-white tracking-tight truncate">{title}</h2>
        ) : (
          <div className="skeleton h-5 w-40 rounded-[8px]" />
        )}
      </div>
      <div className="scroll-row px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
        {Array.from({ length: count }).map((_, i) => (
          <MediaCardSkeleton key={i} size={size} />
        ))}
      </div>
    </section>
  );
}
