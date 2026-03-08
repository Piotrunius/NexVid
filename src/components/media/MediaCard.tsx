/* ============================================
   Media Card – Sequoia Glassmorphism
   ============================================ */

'use client';

import { cn, tmdbImage } from '@/lib/utils';
import { useWatchlistStore } from '@/stores/watchlist';
import type { MediaItem, WatchlistStatus } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';

interface MediaCardProps {
  item: MediaItem;
  size?: 'sm' | 'md' | 'lg';
  showType?: boolean;
}

const STATUSES: WatchlistStatus[] = ['planned', 'watching', 'completed', 'dropped', 'on-hold'];

function StatusIcon({ status }: { status: WatchlistStatus }) {
  switch (status) {
    case 'planned':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case 'watching':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'completed':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>;
    case 'dropped':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case 'on-hold':
      return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>;
  }
}

export function MediaCard({ item, size = 'md', showType = false }: MediaCardProps) {
  const href = item.mediaType === 'movie' ? `/movie/${item.tmdbId}` : `/show/${item.tmdbId}`;
  const [showMenu, setShowMenu] = useState(false);
  const { addItem, getByTmdbId, setStatus: setWatchlistStatus } = useWatchlistStore();
  const watchlistItem = getByTmdbId(item.tmdbId);

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

        {/* Hover overlay */}
        <div className="media-card-overlay">
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <p className="text-[11px] font-medium text-white/50">{item.releaseYear || 'TBA'}</p>
            <p className="text-[13px] font-semibold text-white line-clamp-2 leading-tight mt-0.5">{item.title}</p>
          </div>
        </div>

        {/* Watchlist Button */}
        <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-all duration-400 z-10">
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
              <div className="panel-glass absolute bottom-full left-0 mb-2 w-36 p-1.5 z-20 animate-scale-in">
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

        {/* Rating badge */}
        {item.rating > 0 && (
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

      {/* Title below card */}
      <div className="mt-3 px-1">
        <p className="text-[13px] font-medium text-white/80 line-clamp-1">{item.title}</p>
        <p className="text-[11px] text-white/25 mt-0.5">{item.releaseYear}</p>
      </div>
    </Link>
  );
}

/* ============================================
   Media Row (Horizontal Scroll)
   ============================================ */

interface MediaRowProps {
  title: string;
  items: MediaItem[];
  href?: string;
  showType?: boolean;
}

export function MediaRow({ title, items, href, showType }: MediaRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!rowRef.current) return;
    rowRef.current.scrollTo({ left: 0, behavior: 'auto' });
  }, [title, items.length]);

  return (
    <section className="py-8">
      <div className="mb-5 flex items-center justify-between px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
        <h2 className="text-[20px] font-semibold text-white tracking-tight">{title}</h2>
        {href && (
          <Link href={href} className="text-[13px] font-medium text-accent/70 hover:text-accent transition-colors duration-300 flex items-center gap-1">
            See All
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
          </Link>
        )}
      </div>
      <div ref={rowRef} className="scroll-row home-scroll-row px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
        {items.map((item) => (
          <MediaCard key={`${item.mediaType}-${item.id}`} item={item} showType={showType} />
        ))}
      </div>
    </section>
  );
}

/* ============================================
   Skeleton Loading
   ============================================ */

export function MediaCardSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="media-grid-item flex-shrink-0 w-[180px]">
      <div className="skeleton rounded-[24px] aspect-[2/3] w-full" />
      <div className="mt-3 space-y-2 px-1">
        <div className="skeleton h-3.5 w-3/4 rounded-[8px]" />
        <div className="skeleton h-3 w-1/3 rounded-[8px]" />
      </div>
    </div>
  );
}

export function MediaRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="py-6">
      <div className="mb-4 px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
        <div className="skeleton h-5 w-40 rounded-[8px]" />
      </div>
      <div className="scroll-row px-6 sm:px-8 lg:px-10 max-w-7xl mx-auto">
        {Array.from({ length: count }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
