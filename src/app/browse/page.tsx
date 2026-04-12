/* ============================================
   Browse Page – macOS-style segmented tabs
   ============================================ */

"use client";

import { MediaCard, MediaCardSkeleton } from "@/components/media/MediaCard";
import {
  getAniListAiring,
  getAniListByGenre,
  getAniListPopular,
  getAniListTopRated,
  getAniListTrending,
  searchAnime,
} from "@/lib/anilist";
import { normalizeMediaType } from "@/lib/mediaType";
import { discover, getGenres, getPopular, getTrending } from "@/lib/tmdb";
import { useBlockedContentStore } from "@/stores/blockedContent";
import type { Genre, MediaItem } from "@/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Tab = "trending" | "movies" | "shows" | "anime";
type Filter = "popular" | "top_rated" | "airing" | string;

const ANIME_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Isekai",
  "Mecha",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

export default function BrowsePage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get("tab") as Tab) ?? "trending";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [filter, setFilter] = useState<Filter>("popular");
  const [year, setYear] = useState("");
  const [animeSearch, setAnimeSearch] = useState("");
  const [animeSearchInput, setAnimeSearchInput] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const { blockedItems, isBlocked } = useBlockedContentStore();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const [movieG, tvG] = await Promise.all([
          getGenres("movie"),
          getGenres("tv"),
        ]);
        setMovieGenres(movieG);
        setTvGenres(tvG);
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    if (tab === "movies") setGenres(movieGenres);
    else if (tab === "shows") setGenres(tvGenres);
    else setGenres([]);
  }, [tab, movieGenres, tvGenres]);

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    loadItems(1, true);
  }, [tab, filter, year, animeSearch]);

  const loadItems = useCallback(
    async (p: number, reset = false) => {
      setIsLoading(true);
      try {
        let results: MediaItem[] = [];

        if (tab === "anime") {
          // --- Anime tab: AniList ---
          if (animeSearch.trim()) {
            const res = await searchAnime(animeSearch.trim(), p);
            results = res.results;
            if (results.length < 20) setHasMore(false);
          } else if (filter === "popular") {
            results = await getAniListPopular(p);
          } else if (filter === "top_rated") {
            results = await getAniListTopRated(p);
          } else if (filter === "airing") {
            results = await getAniListAiring(p);
          } else if (filter === "trending") {
            results = await getAniListTrending(p);
          } else {
            // Genre filter
            results = await getAniListByGenre(filter, p);
          }
          if (results.length < 20) setHasMore(false);
        } else {
          // --- Standard tabs: TMDB ---
          const mediaType =
            tab === "movies" ? "movie" : tab === "shows" ? "tv" : "all";

          if (tab === "trending") {
            results = await getTrending(mediaType, "week", p);
          } else {
            const params: Record<string, string> = {
              page: String(p),
              sort_by: "popularity.desc",
            };

            if (filter !== "popular" && filter !== "top_rated") {
              params.with_genres = filter;
            } else if (filter === "top_rated") {
              params["vote_count.gte"] = "500";
              params.sort_by = "vote_average.desc";
            }

            if (year) {
              const yearKey =
                tab === "movies"
                  ? "primary_release_year"
                  : "first_air_date_year";
              params[yearKey] = year;
            }

            results = await discover(mediaType as "movie" | "tv", params);
          }
        }

        const filteredResults = results.filter(
          (item) => !isBlocked(item.tmdbId, item.mediaType),
        );

        if (results.length < 20) setHasMore(false);
        setItems((prev) =>
          reset ? filteredResults : [...prev, ...filteredResults],
        );
      } catch (err) {
        console.error("Failed to load browse items:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [tab, filter, year, animeSearch, blockedItems],
  );

  const loadMore = () => {
    if (!isLoading && hasMore) {
      const next = page + 1;
      setPage(next);
      loadItems(next);
    }
  };

  const handleRandom = useCallback(async () => {
    setIsLoading(true);
    try {
      if (tab === "anime") {
        const results = await getAniListPopular(Math.floor(Math.random() * 3) + 1);
        const filtered = results.filter(
          (item) => !isBlocked(item.tmdbId, item.mediaType),
        );
        if (filtered.length > 0) {
          const randomItem = filtered[Math.floor(Math.random() * filtered.length)];
          // AniList items: navigate to AniList search on show page
          router.push(`/show/${randomItem.tmdbId}`);
        }
      } else {
        const type =
          tab === "movies"
            ? "movie"
            : tab === "shows"
              ? "tv"
              : Math.random() > 0.5
                ? "movie"
                : "tv";
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const results = await getPopular(type as "movie" | "tv", randomPage);
        const filteredResults = results.filter(
          (item) => !isBlocked(item.tmdbId, item.mediaType),
        );
        if (filteredResults.length > 0) {
          const randomItem =
            filteredResults[Math.floor(Math.random() * filteredResults.length)];
          const routeType = normalizeMediaType(randomItem.mediaType);
          router.push(`/${routeType}/${randomItem.tmdbId}`);
        }
      }
    } catch (err) {
      console.error("Failed to get random item:", err);
    } finally {
      setIsLoading(false);
    }
  }, [tab, router, blockedItems]);

  const handleAnimeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAnimeSearch(animeSearchInput);
    setFilter("popular");
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "trending",
      label: "Trending",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
    },
    {
      key: "movies",
      label: "Movies",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="2" y1="7" x2="7" y2="7" />
          <line x1="2" y1="17" x2="7" y2="17" />
          <line x1="17" y1="7" x2="22" y2="7" />
          <line x1="17" y1="17" x2="22" y2="17" />
        </svg>
      ),
    },
    {
      key: "shows",
      label: "TV Shows",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
          <polyline points="17 2 12 7 7 2" />
        </svg>
      ),
    },
    {
      key: "anime",
      label: "Anime",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      ),
    },
  ];

  const standardFilters: { key: Filter; label: string }[] = [
    { key: "popular", label: "Popular" },
    { key: "top_rated", label: "Top Rated" },
  ];

  const animeFilters: { key: Filter; label: string }[] = [
    { key: "popular", label: "Popular" },
    { key: "trending", label: "Trending" },
    { key: "top_rated", label: "Top Rated" },
    { key: "airing", label: "Airing Now" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-10">
      <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
        <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.35)] sm:p-6">
          <h1 className="text-[30px] font-bold text-text-primary tracking-tight">
            Browse
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Discover trending titles, movies, shows and anime
          </p>
        </div>

        {/* Segmented control */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 p-1 rounded-full bg-white/5 w-fit">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setFilter("popular");
                  setAnimeSearch("");
                  setAnimeSearchInput("");
                }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black uppercase transition-all tracking-wider border ${
                  tab === t.key
                    ? "bg-accent-muted text-accent border-accent-glow"
                    : "bg-transparent text-white/40 border-transparent hover:text-white"
                }`}
              >
                <span className="opacity-80">{t.icon}</span>
                {t.label}
                {t.key === "anime"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {tab !== "trending" && tab !== "anime" && (
              <input
                type="number"
                placeholder="Year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="bg-white/[0.04] border border-white/10 rounded-full px-4 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-accent w-24 placeholder:text-white/20 hover:bg-white/[0.08] transition-colors"
              />
            )}
            <button
              onClick={handleRandom}
              disabled={isLoading}
              className="btn-glass !px-5 !py-2 text-[13px] font-bold text-white/80 hover:text-white"
            >
              Surprise Me
            </button>
          </div>
        </div>

        {/* Anime search bar */}
        {tab === "anime"}

        {/* Sub-filters */}
        {tab !== "trending" && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {(tab === "anime" ? animeFilters : standardFilters).map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key);
                  setAnimeSearch("");
                  setAnimeSearchInput("");
                }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black uppercase transition-all tracking-wider border whitespace-nowrap ${
                  filter === f.key && !animeSearch
                    ? "bg-accent-muted text-accent border-accent-glow"
                    : "bg-transparent text-white/40 border-transparent hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}

            {tab !== "anime" && genres.length > 0 && (
              <>
                <div className="w-px h-5 bg-white/10 self-center mx-1" />
                {genres.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setFilter(String(g.id))}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black uppercase transition-all tracking-wider border whitespace-nowrap ${
                      filter === String(g.id)
                        ? "bg-accent-muted text-accent border-accent-glow"
                        : "bg-transparent text-white/40 border-transparent hover:text-white"
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </>
            )}

            {tab === "anime" && !animeSearch && (
              <>
                <div className="w-px h-5 bg-white/10 self-center mx-1" />
                {ANIME_GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => setFilter(g)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black uppercase transition-all tracking-wider border whitespace-nowrap ${
                      filter === g
                        ? "bg-accent-muted text-accent border-accent-glow"
                        : "bg-transparent text-white/40 border-transparent hover:text-white"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="media-grid">
          {items.map((item) => (
            <MediaCard
              key={`${item.id}-${item.mediaType}`}
              item={item}
              showType={tab === "trending"}
            />
          ))}
          {isLoading &&
            Array.from({ length: 12 }).map((_, i) => (
              <MediaCardSkeleton key={`skel-${i}`} />
            ))}
        </div>

        {/* Load More */}
        {hasMore && !isLoading && items.length > 0 && (
          <div className="mt-8 flex justify-center">
            <button onClick={loadMore} className="btn-glass px-8">
              Load More
            </button>
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="h-[40vh] flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-white/20"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3 className="text-white font-medium mb-1">No results found</h3>
            <p className="text-white/40 text-[13px]">
              {tab === "anime"
                ? "Try a different search term or filter"
                : "Try adjusting your filters or search criteria"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
