/* ============================================
   Media Card – Sequoia Glassmorphism
   ============================================ */

'use client';

import { cn, formatTime, tmdbImage } from '@/lib/utils';
import { normalizeMediaType } from '@/lib/mediaType';
import { useWatchlistStore } from '@/stores/watchlist';
import type { MediaItem, WatchlistStatus } from '@/types';
import { Check, CheckCircle2, Clock, PauseCircle, PlayCircle, Plus, XCircle } from 'lucide-react';
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
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function StatusIcon({ status }: { status: WatchlistStatus }) {
  switch (status) {
    case 'Planned':
      return <Clock className="h-3 w-3" />;
    case 'Watching':
      return <PlayCircle className="h-3 w-3" />;
    case 'Completed':
      return <CheckCircle2 className="h-3 w-3" />;
    case 'Dropped':
      return <XCircle className="h-3 w-3" />;
    case 'On-Hold':
      return <PauseCircle className="h-3 w-3" />;
  }
}

export function MediaCard({ item, size = 'md', showType = false }: MediaCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const watchlistItem = useWatchlistStore((s) => s.getByTmdbId(item.tmdbId));
  const isInWatchlist = useWatchlistStore((s) => s.isInWatchlist(item.tmdbId));
  const progress = watchlistItem?.progress;
  const hasProgress = mounted && progress && (progress.percentage || 0) > 0.1;
  const normalizedItemType = normalizeMediaType(item.mediaType);
  const normalizedWatchlistType = normalizeMediaType(watchlistItem?.mediaType);
  const isShow = normalizedItemType === 'show' || normalizedWatchlistType === 'show';

  const canonicalType = normalizedItemType === 'show' ? 'show' : 'movie';
  const defaultHref = canonicalType === 'movie' ? `/movie/${item.tmdbId}` : `/show/${item.tmdbId}`;

  const watchUrl = hasProgress
    ? `/watch/${canonicalType}/${item.tmdbId}?s=${progress.season || 1}&e=${progress.episode || 1}&t=${progress.timestamp || 0}`
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
      addItem({
        mediaType: canonicalType,
        tmdbId: item.tmdbId,
        title: item.title,
        posterPath: item.posterPath,
        status,
      });
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
    <Link href={href} className={cn('media-card media-grid-item group', sizeClasses[size])}>
      <div className="duration-600 relative aspect-[2/3] overflow-hidden rounded-[24px] bg-black shadow-[0_4px_24px_rgba(0,0,0,0.6)] transition-all ease-[var(--spring)] group-hover:shadow-[0_12px_48px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.1)]">
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
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-white/15"
            >
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <path d="m10 8 6 4-6 4z" />
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

        {/* Removed center play overlay on hover as requested */}

        {/* Watchlist Button */}
        {mounted && (
          <div className="absolute bottom-3 right-3 z-10 opacity-80 transition-opacity duration-200 group-hover:opacity-100">
            <div className="relative">
              <button
                onClick={handleToggleMenu}
                className={cn(
                  'duration-400 flex h-8 w-8 items-center justify-center rounded-[12px] backdrop-blur-[20px] transition-all ease-[var(--spring)] active:scale-90',
                  isInWatchlist
                    ? 'bg-accent/80 text-white'
                    : 'bg-black/40 text-white/80 hover:bg-black/60',
                )}
                title={watchlistItem ? watchlistItem.status : 'Add to List'}
              >
                {isInWatchlist ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
              {showMenu && (
                <div className="panel-glass absolute bottom-full right-0 z-20 mb-2 w-36 animate-scale-in p-1.5">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      onClick={(e) => handleWatchlistClick(e, status)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] capitalize transition-all duration-300',
                        watchlistItem?.status === status
                          ? 'bg-accent/15 font-medium text-accent'
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
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.5)] backdrop-blur-[20px]">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-amber-400"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="text-[10px] font-bold text-white">{item.rating}</span>
          </div>
        )}

        {/* Type badge */}
        {showType && (
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.5)] backdrop-blur-[20px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">
              {canonicalType === 'movie' ? 'Movie' : 'TV'}
            </span>
          </div>
        )}
      </div>

      {/* Title below card - Enhanced Info */}
      <div className="mt-3 space-y-0.5 px-1">
        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-1 flex-1 text-[13px] font-bold tracking-tight text-white/90">
            {item.title}
          </p>
          {hasProgress && progress && (
            <span className="bg-accent/10 rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-tighter text-accent">
              {Math.round(progress.percentage || 0)}%
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] font-medium">
          <p className="text-white/30">
            {mounted && watchlistItem?.updatedAt
              ? formatRelativeTime(watchlistItem.updatedAt)
              : item.releaseYear}
          </p>
          {hasProgress && progress && (
            <p className="font-bold tracking-wide text-white/50">
              {isShow
                ? `S${progress.season}:E${progress.episode}`
                : formatTime(progress.timestamp || 0)}
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
  seeAllLabel = 'See All',
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
    row.scrollBy({
      left: direction === 'left' ? -delta : delta,
      behavior: 'smooth',
    });
  };

  useLayoutEffect(() => {
    if (!rowRef.current) return;
    // Keep current scroll position while preserving scroll-button state.
    updateScrollState();
  }, [items.length]);

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
    <section className={cn(noPadding ? 'py-2' : 'py-8', 'relative overflow-x-hidden')}>
      {!noHeader && (
        <div
          className={cn(
            'flex w-full items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16',
            noPadding ? 'mb-3' : 'mb-5',
          )}
        >
          <div className="mr-4 min-w-0 flex-1">
            {typeof title === 'string' ? (
              <h2 className="truncate text-[20px] font-semibold tracking-tight text-white">
                {title}
              </h2>
            ) : (
              title
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            {enableControls && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => scrollRow('left')}
                  disabled={!canScrollLeft}
                  aria-label={`Scroll left`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-all duration-300 hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <button
                  onClick={() => scrollRow('right')}
                  disabled={!canScrollRight}
                  aria-label={`Scroll right`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-all duration-300 hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
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
                    : 'text-accent/70 text-[13px] font-medium hover:text-accent',
                )}
              >
                {seeAllLabel}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      )}
      <div
        ref={rowRef}
        className="scroll-row home-scroll-row px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16"
      >
        {items.map((item, index) => (
          <MediaCard
            key={`${item.mediaType}-${item.id}-${item.tmdbId}-${index}`}
            item={item}
            showType={showType}
          />
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
      <div className="skeleton aspect-[2/3] w-full rounded-[24px]" />
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
      <div
        className={cn(
          'flex w-full items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16',
          noPadding ? 'mb-3' : 'mb-5',
        )}
      >
        <div className="mr-4 min-w-0 flex-1">
          {title ? (
            <h2 className="truncate text-[20px] font-semibold tracking-tight text-white">
              {title}
            </h2>
          ) : (
            <div className="skeleton h-5 w-40 rounded-[8px]" />
          )}
        </div>
      </div>
      <div className="scroll-row px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        {Array.from({ length: count }).map((_, i) => (
          <MediaCardSkeleton key={i} size={size} />
        ))}
      </div>
    </section>
  );
}
