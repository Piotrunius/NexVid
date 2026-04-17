/* ============================================
   Watchlist Page – macOS glass design
   ============================================ */

"use client";

import { toTmdbMediaType } from "@/lib/mediaType";
import { cn, tmdbImage } from "@/lib/utils";
import { useBlockedContentStore } from "@/stores/blockedContent";
import { useWatchlistStore } from "@/stores/watchlist";
import type { WatchlistItem, WatchlistStatus } from "@/types";
import {
  CheckCircle2,
  Clock,
  LayoutGrid,
  PauseCircle,
  PlayCircle,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const STATUSES: {
  key: WatchlistStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    key: "Watching",
    label: "Watching",
    icon: <PlayCircle className="h-[12px] w-[12px]" />,
    color: "text-blue-400",
  },
  {
    key: "Planned",
    label: "Planned",
    icon: <Clock className="h-[12px] w-[12px]" />,
    color: "text-yellow-400",
  },
  {
    key: "Completed",
    label: "Completed",
    icon: <CheckCircle2 className="h-[12px] w-[12px]" />,
    color: "text-green-400",
  },
  {
    key: "On-Hold",
    label: "On Hold",
    icon: <PauseCircle className="h-[12px] w-[12px]" />,
    color: "text-orange-400",
  },
  {
    key: "Dropped",
    label: "Dropped",
    icon: <XCircle className="h-[12px] w-[12px]" />,
    color: "text-red-400",
  },
];

export default function WatchlistPage() {
  const { items, removeItem, setStatus } = useWatchlistStore();
  const [activeStatus, setActiveStatus] = useState<WatchlistStatus | "all">(
    "all",
  );
  const [sortBy, setSortBy] = useState<"title" | "added" | "rating">("added");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const blockedItems = useBlockedContentStore((s) => s.blockedItems);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Close menu if click is outside any watchlist card menu
      if (!(e.target as HTMLElement).closest(".watchlist-menu-container")) {
        setActiveMenuId(null);
      }
    };
    if (activeMenuId) {
      window.addEventListener("click", handleClickOutside);
    }
    return () => window.removeEventListener("click", handleClickOutside);
  }, [activeMenuId]);


  const continueWatching = useMemo(
    () =>
      items
        .filter(
          (item: WatchlistItem) =>
            (item.progress?.percentage || 0) > 0.1 &&
            !blockedItems.some((b) => {
              const normalizedType = toTmdbMediaType(item.mediaType);
              return (
                String(b.tmdbId) === String(item.tmdbId) &&
                b.mediaType === normalizedType
              );
            }),
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 12),
    [items, blockedItems],
  );

  const filteredItems = useMemo(() => {
    // Exclude items with status 'none' (those are only for Continue Watching)
    let list = items.filter(
      (i) =>
        i.status !== "none" &&
        !blockedItems.some((b) => {
          const normalizedType = toTmdbMediaType(i.mediaType);
          return (
            String(b.tmdbId) === String(i.tmdbId) &&
            b.mediaType === normalizedType
          );
        }),
    );

    if (activeStatus !== "all") {
      list = list.filter((i: WatchlistItem) => i.status === activeStatus);
    }

    list = [...list].sort((a: WatchlistItem, b: WatchlistItem) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });
    return list;
  }, [items, activeStatus, sortBy]);

  const statusCounts = useMemo(() => {
    const activeItems = items.filter(
      (i) =>
        i.status !== "none" &&
        !blockedItems.some((b) => {
          const normalizedType = toTmdbMediaType(i.mediaType);
          return (
            String(b.tmdbId) === String(i.tmdbId) &&
            b.mediaType === normalizedType
          );
        }),
    );
    const counts: Record<string, number> = { all: activeItems.length };
    STATUSES.forEach((s) => {
      counts[s.key] = activeItems.filter(
        (i: WatchlistItem) => i.status === s.key,
      ).length;
    });
    return counts;
  }, [items, blockedItems]);

  return (
    <div className="relative min-h-screen overflow-x-hidden pt-24 pb-10">
      <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] sm:p-6">
          <h1 className="text-[30px] font-bold text-text-primary tracking-tight">
            My List
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Track what you watch and continue where you left off
          </p>
        </div>

        <div className="mt-2 mb-7 flex items-center justify-between gap-4">
          <h2 className="text-[20px] font-semibold text-text-primary tracking-tight">
            Watchlist
          </h2>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="input !w-auto min-w-[170px] !py-2 !px-3 !text-[12px]"
          >
            <option value="added">Recently Added</option>
            <option value="title">Title A-Z</option>
            <option value="rating">Rating</option>
          </select>
        </div>

        {/* Segmented status tabs matching Admin Feedback style */}
        <div className="w-full overflow-x-auto pb-4 mb-2 -mx-4 px-4 sm:mx-0 sm:px-0 custom-scrollbar">
          <div className="flex gap-2 p-1 rounded-full bg-white/5 w-max">
            <button
              onClick={() => setActiveStatus("all")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-black uppercase transition-all tracking-wider border whitespace-nowrap shrink-0 ${activeStatus === "all" ? "bg-accent-muted text-accent border-accent-glow" : "bg-transparent text-white/40 border-transparent hover:text-white"}`}
            >
              <span className="text-[12px] opacity-80">
                <LayoutGrid className="h-[12px] w-[12px]" />
              </span>
              All
            </button>
            {STATUSES.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveStatus(s.key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black uppercase transition-all tracking-wider border whitespace-nowrap shrink-0 ${activeStatus === s.key ? "bg-accent-muted text-accent border-accent-glow" : "bg-transparent text-white/40 border-transparent hover:text-white"}`}
              >
                <span className="text-[12px] opacity-80">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[15px] font-semibold text-text-primary mb-3">
              Continue Watching
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {continueWatching.map((item) => {
                const href =
                  item.mediaType === "movie"
                    ? `/watch/movie/${item.tmdbId}${item.progress?.timestamp ? `?t=${item.progress.timestamp}` : ""}`
                    : `/watch/show/${item.tmdbId}?s=${item.progress?.season || 1}&e=${item.progress?.episode || 1}${item.progress?.timestamp ? `&t=${item.progress.timestamp}` : ""}`;
                return (
                  <ContinueWatchingCard
                    key={`continue-${item.id}`}
                    item={item}
                    href={href}
                    onRemove={() =>
                      useWatchlistStore.getState().clearProgress(item.id)
                    }
                  />
                );
              })}
            </div>
          </section>
        )}

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-glass-light)] mb-4">
              <svg
                className="text-text-muted"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 12h6M12 9v6" />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-text-secondary">
              No items in your list
            </p>
            <p className="text-[13px] text-text-muted mt-1">
              Start browsing to add movies & shows
            </p>
            <Link href="/browse" className="btn-accent mt-4">
              Browse Content
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item: WatchlistItem) => (
              <WatchlistCard
                key={item.id}
                item={item}
                onRemove={removeItem}
                onStatusChange={setStatus}
                isActive={activeMenuId === item.id}
                onToggleMenu={(open) => setActiveMenuId(open ? item.id : null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContinueWatchingCard({
  item,
  href,
  onRemove,
}: {
  item: WatchlistItem;
  href: string;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="glass-card glass-liquid group relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        className="absolute right-2 top-2 z-10 rounded-[8px] bg-[var(--bg-primary)]/75 p-1.5 text-text-secondary backdrop-blur-sm transition-all hover:text-red-400 opacity-100"
        title="Remove"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <Link href={href} className="flex gap-3 p-3">
        <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-[10px] bg-[var(--bg-tertiary)]">
          {item.posterPath ? (
            <Image
              src={tmdbImage(item.posterPath, "w200")}
              alt={item.title}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="m10 8 6 4-6 4z" />
              </svg>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 py-1">
          <p className="truncate text-[13px] font-semibold text-text-primary">
            {item.title}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {(item.mediaType === "show" || item.mediaType === "tv") &&
            item.progress?.season &&
            item.progress?.episode
              ? `S${item.progress.season} E${item.progress.episode}`
              : "Movie"}
          </p>
          <div className="mt-2 h-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
            <div
              className="h-full bg-accent rounded-full shadow-[0_0_6px_var(--accent-glow)]"
              style={{ width: `${item.progress?.percentage || 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-text-muted">
            {Math.round(item.progress?.percentage || 0)}% watched
          </p>
        </div>
      </Link>
    </div>
  );
}

function WatchlistCard({
  item,
  onRemove,
  onStatusChange,
  isActive,
  onToggleMenu,
}: {
  item: WatchlistItem;
  onRemove: (id: string) => void;
  onStatusChange: (id: string, status: WatchlistStatus) => void;
  isActive: boolean;
  onToggleMenu: (open: boolean) => void;
}) {
  const [openUp, setOpenUp] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isActive && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // If the button is in the lower half of the viewport, open the menu upwards
      setOpenUp(rect.top > window.innerHeight / 1.65);
    }
    onToggleMenu(!isActive);
  };


  const statusInfo = STATUSES.find((s) => s.key === item.status);
  const link =
    item.mediaType === "movie"
      ? `/movie/${item.tmdbId}`
      : `/show/${item.tmdbId}`;

  return (
    <div
      className={cn(
        "glass-card group relative",
        isActive && "z-40 overflow-visible",
      )}
    >
      <Link href={link} className="flex gap-3 p-3">
        <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-[10px] bg-[var(--bg-tertiary)]">
          {item.posterPath ? (
            <Image
              src={tmdbImage(item.posterPath, "w200")}
              alt={item.title}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="m10 8 6 4-6 4z" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 py-1">
          <p className="text-[13px] font-semibold text-text-primary truncate">
            {item.title}
          </p>
          <p className="text-[11px] text-text-muted mt-0.5 capitalize">
            {item.mediaType}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[12px]">{statusInfo?.icon}</span>
            <span
              className={cn(
                "text-[12px] font-medium capitalize",
                statusInfo?.color,
              )}
            >
              {item.status.replace("-", " ")}
            </span>
          </div>
          {item.progress && item.progress.percentage != null && (
            <div className="mt-2">
              <div className="h-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full shadow-[0_0_6px_var(--accent-glow)] transition-all"
                  style={{ width: `${item.progress.percentage}%` }}
                />
              </div>
              <p className="text-[10px] text-text-muted mt-1">
                {item.progress.season && item.progress.episode
                  ? `S${item.progress.season} E${item.progress.episode}`
                  : `${Math.round(item.progress.percentage)}%`}
              </p>
            </div>
          )}
          {item.rating && (
            <div className="flex items-center gap-1 mt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg
                  key={i}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill={i < item.rating! ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  className={cn(
                    i < item.rating! ? "text-amber-400" : "text-text-muted",
                  )}
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ))}
            </div>
          )}
        </div>
      </Link>

      {/* Hover menu */}
      <div
        className={cn(
          "absolute right-2 top-2 transition-opacity opacity-100 watchlist-menu-container",
        )}
      >
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={handleToggleMenu}
            className="rounded-[8px] bg-[var(--bg-primary)]/80 p-1.5 text-text-secondary hover:text-text-primary backdrop-blur-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {isActive && (
            <div
              className={cn(
                "absolute right-0 panel-glass w-40 p-1.5 z-50 animate-scale-in rounded-[12px] origin-top-right",
                openUp
                  ? "bottom-full mb-2 origin-bottom-right"
                  : "top-full mt-1",
              )}
            >
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(item.id, s.key);
                    onToggleMenu(false);
                  }}
                  className={cn(
                    "w-full rounded-[8px] px-3 py-1.5 text-left text-[12px] transition-colors flex items-center gap-2",
                    item.status === s.key
                      ? "bg-accent/15 text-accent"
                      : "text-text-secondary hover:bg-[var(--bg-glass-light)]",
                  )}
                >
                  <span>{s.icon}</span>
                  {s.label}
                </button>
              ))}
              <hr className="my-1 border-white/[0.06]" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                  onToggleMenu(false);
                }}
                className="w-full rounded-[8px] px-3 py-1.5 text-left text-[12px] text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// CACHE BUSTER 1
