/* ============================================
   Watchlist Page – macOS glass design
   ============================================ */

'use client';

import { cn, tmdbImage } from '@/lib/utils';
import { useBlockedContentStore } from '@/stores/blockedContent';
import { useWatchlistStore } from '@/stores/watchlist';
import type { WatchlistItem, WatchlistStatus } from '@/types';
import { CheckCircle2, Clock, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const STATUSES: { key: WatchlistStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'Watching', label: 'Watching', icon: <PlayCircle className="h-[12px] w-[12px]" />, color: 'text-blue-400' },
  { key: 'Planned', label: 'Planned', icon: <Clock className="h-[12px] w-[12px]" />, color: 'text-yellow-400' },
  { key: 'Completed', label: 'Completed', icon: <CheckCircle2 className="h-[12px] w-[12px]" />, color: 'text-green-400' },
  { key: 'On-Hold', label: 'On Hold', icon: <PauseCircle className="h-[12px] w-[12px]" />, color: 'text-orange-400' },
  { key: 'Dropped', label: 'Dropped', icon: <XCircle className="h-[12px] w-[12px]" />, color: 'text-red-400' },
];

export default function WatchlistPage() {
  const { items, removeItem, setStatus } = useWatchlistStore();
  const [activeStatus, setActiveStatus] = useState<WatchlistStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'title' | 'added' | 'rating'>('added');
  const blockedItems = useBlockedContentStore((s) => s.blockedItems);

  const continueWatching = useMemo(
    () => items
      .filter((item: WatchlistItem) =>
        (item.progress?.percentage || 0) > 0.1 &&
        !blockedItems.some(b => String(b.tmdbId) === String(item.tmdbId) && b.mediaType === (item.mediaType === 'show' ? 'tv' : 'movie'))
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 12),
    [items, blockedItems],
  );

  const filteredItems = useMemo(() => {
    // Exclude items with status 'none' (those are only for Continue Watching)
    let list = items.filter(i =>
      i.status !== 'none' &&
      !blockedItems.some(b => String(b.tmdbId) === String(i.tmdbId) && b.mediaType === (i.mediaType === 'show' ? 'tv' : 'movie'))
    );

    if (activeStatus !== 'all') {
      list = list.filter((i: WatchlistItem) => i.status === activeStatus);
    }

    list = [...list].sort((a: WatchlistItem, b: WatchlistItem) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });
    return list;
  }, [items, activeStatus, sortBy]);

  const statusCounts = useMemo(() => {
    const activeItems = items.filter(i =>
      i.status !== 'none' &&
      !blockedItems.some(b => String(b.tmdbId) === String(i.tmdbId) && b.mediaType === (i.mediaType === 'show' ? 'tv' : 'movie'))
    );
    const counts: Record<string, number> = { all: activeItems.length };
    STATUSES.forEach((s) => { counts[s.key] = activeItems.filter((i: WatchlistItem) => i.status === s.key).length; });
    return counts;
  }, [items, blockedItems]);

  return (
    <div className="min-h-screen pt-20 pb-12 px-6 sm:px-8 lg:px-10">
      <div className="w-full">
        {/* Modern Header */}
        <div className="mb-8 rounded-[28px] bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-8 border border-accent/10 backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-[36px] font-bold text-text-primary tracking-tight mb-2">My List</h1>
              <p className="text-[14px] text-text-muted">Track and manage your watchlist</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="glass-card px-4 py-2 rounded-full">
                <p className="text-[13px] text-text-muted">Total: <span className="font-bold text-accent">{statusCounts.all}</span></p>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="input !py-2.5 !px-4 !text-[13px] !rounded-full"
              >
                <option value="added">Recently Added</option>
                <option value="title">Title A-Z</option>
                <option value="rating">Rating</option>
              </select>
            </div>
          </div>
        </div>

        {/* Enhanced Status Tabs */}
        <div className="mb-8 p-2 rounded-[24px] bg-[var(--bg-glass)] backdrop-blur-xl border border-white/5 inline-flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveStatus('all')}
            className={cn(
              'flex items-center gap-2 rounded-[16px] px-6 py-3 text-[13px] font-semibold whitespace-nowrap transition-all duration-300',
              activeStatus === 'all'
                ? 'bg-gradient-to-br from-accent to-accent-hover text-white shadow-[0_4px_20px_var(--accent-glow)]'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.06]',
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
            All
            <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', activeStatus === 'all' ? 'bg-white/20' : 'bg-[var(--bg-glass-light)]')}>{statusCounts.all}</span>
          </button>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveStatus(s.key)}
              className={cn(
                'flex items-center gap-2 rounded-[16px] px-6 py-3 text-[13px] font-semibold whitespace-nowrap transition-all duration-300',
                activeStatus === s.key
                  ? 'bg-gradient-to-br from-accent to-accent-hover text-white shadow-[0_4px_20px_var(--accent-glow)]'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.06]',
              )}
            >
              <span className="text-[14px]">{s.icon}</span>
              {s.label}
              <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', activeStatus === s.key ? 'bg-white/20' : 'bg-[var(--bg-glass-light)]')}>{statusCounts[s.key]}</span>
            </button>
          ))}
        </div>

        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[20px] font-bold text-text-primary">Continue Watching</h2>
              <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21"/>
                </svg>
                {continueWatching.length} in progress
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {continueWatching.map((item) => {
                const href = item.mediaType === 'movie'
                  ? `/watch/movie/${item.tmdbId}${item.progress?.timestamp ? `?t=${item.progress.timestamp}` : ''}`
                  : `/watch/show/${item.tmdbId}?s=${item.progress?.season || 1}&e=${item.progress?.episode || 1}${item.progress?.timestamp ? `&t=${item.progress.timestamp}` : ''}`;
                return <ContinueWatchingCard key={`continue-${item.id}`} item={item} href={href} onRemove={() => useWatchlistStore.getState().clearProgress(item.id)} />;
              })}
            </div>
          </section>
        )}

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-accent/5 mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
              <svg className="text-accent" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 12h6M12 9v6" />
              </svg>
            </div>
            <p className="text-[18px] font-bold text-text-primary mb-2">Your watchlist is empty</p>
            <p className="text-[14px] text-text-muted max-w-md">Start adding movies and shows to keep track of what you want to watch</p>
            <Link href="/browse" className="btn-accent mt-6 !px-8 !py-3">Browse Content</Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[20px] font-bold text-text-primary">
                {activeStatus === 'all' ? 'All Items' : STATUSES.find(s => s.key === activeStatus)?.label}
              </h2>
              <div className="text-[12px] text-text-muted">
                {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredItems.map((item: WatchlistItem) => (
              <WatchlistCard key={item.id} item={item} onRemove={removeItem} onStatusChange={setStatus} />
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContinueWatchingCard({ item, href, onRemove }: { item: WatchlistItem; href: string; onRemove: (id: string) => void }) {
  return (
    <div className="glass-card glass-liquid group relative rounded-[20px] overflow-hidden hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300">
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white/70 backdrop-blur-md transition-all hover:bg-black/80 hover:text-red-400 opacity-0 group-hover:opacity-100"
        title="Remove from Continue Watching"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      <Link href={href} className="block">
        <div className="relative aspect-[2/3] overflow-hidden bg-[var(--bg-tertiary)]">
          {item.posterPath ? (
            <Image src={tmdbImage(item.posterPath, 'w500')} alt={item.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="m10 8 6 4-6 4z"/></svg>
            </div>
          )}
          {/* Progress Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4 pt-8">
            <div className="mb-2">
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-accent rounded-full shadow-[0_0_12px_var(--accent-glow)]" style={{ width: `${item.progress?.percentage || 0}%` }} />
              </div>
            </div>
            <p className="text-[11px] font-semibold text-white/90">{Math.round(item.progress?.percentage || 0)}% complete</p>
          </div>
        </div>
        <div className="p-4">
          <p className="font-bold text-[14px] text-text-primary line-clamp-2 mb-1">{item.title}</p>
          <p className="text-[12px] text-text-muted">
            {item.mediaType === 'show' && item.progress?.season && item.progress?.episode ? `S${item.progress.season} E${item.progress.episode}` : 'Movie'}
          </p>
        </div>
      </Link>
    </div>
  );
}

function WatchlistCard({ item, onRemove, onStatusChange }: { item: WatchlistItem; onRemove: (id: string) => void; onStatusChange: (id: string, status: WatchlistStatus) => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const statusInfo = STATUSES.find((s) => s.key === item.status);
  const link = item.mediaType === 'movie' ? `/movie/${item.tmdbId}` : `/show/${item.tmdbId}`;

  return (
    <div className={cn('glass-card glass-liquid group relative rounded-[20px] overflow-hidden hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300', showMenu && 'z-50')}>
      <Link href={link} className="block">
        <div className="relative aspect-[2/3] overflow-hidden bg-[var(--bg-tertiary)]">
          {item.posterPath ? (
            <Image src={tmdbImage(item.posterPath, 'w500')} alt={item.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="m10 8 6 4-6 4z"/></svg>
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-3 left-3">
            <div className={cn('flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-md px-3 py-1.5', statusInfo?.color)}>
              <span className="text-[12px]">{statusInfo?.icon}</span>
              <span className="text-[11px] font-semibold">{item.status.replace('-', ' ')}</span>
            </div>
          </div>

          {/* Progress Bar if available */}
          {item.progress && item.progress.percentage != null && (
            <div className="absolute bottom-0 left-0 right-0">
              <div className="h-1.5">
                <div className="h-full bg-accent shadow-[0_0_12px_var(--accent-glow)] transition-all" style={{ width: `${item.progress.percentage}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="p-4">
          <p className="font-bold text-[14px] text-text-primary line-clamp-2 mb-1.5">{item.title}</p>
          <div className="flex items-center justify-between text-[12px] text-text-muted">
            <span className="capitalize">{item.mediaType}</span>
            {item.rating && (
              <div className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span className="font-semibold">{item.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
          {item.progress?.season && item.progress?.episode && (
            <p className="text-[11px] text-accent font-medium mt-1">S{item.progress.season} E{item.progress.episode}</p>
          )}
        </div>
      </Link>

      {/* Hover Menu Button */}
      <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu); }}
          className="rounded-full bg-black/70 backdrop-blur-md p-2 text-white/80 hover:text-white transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-2 panel-glass w-48 p-2 z-50 animate-scale-in rounded-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="mb-1 px-3 py-2">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Change Status</p>
              </div>
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={(e) => { e.stopPropagation(); onStatusChange(item.id, s.key); setShowMenu(false); }}
                  className={cn(
                    'w-full rounded-[12px] px-3 py-2.5 text-left text-[13px] transition-colors flex items-center gap-2.5',
                    item.status === s.key ? 'bg-accent/15 text-accent font-semibold' : 'text-text-secondary hover:bg-[var(--bg-glass-light)]',
                  )}
                >
                  <span className="text-[14px]">{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
              <div className="my-2 h-px bg-white/[0.06]" />
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(item.id); setShowMenu(false); }}
                className="w-full rounded-[12px] px-3 py-2.5 text-left text-[13px] text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2.5 font-medium"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Remove from List
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
