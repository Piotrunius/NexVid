/* ============================================
   Show Details Page – macOS glass design
   ============================================ */

'use client';

import { MediaRow } from '@/components/media/MediaCard';
import { getRecommendations, getSeasonDetails, getShowDetails, getSimilar } from '@/lib/tmdb';
import { cn, tmdbImage } from '@/lib/utils';
import { useWatchlistStore } from '@/stores/watchlist';
import type { MediaItem, Season, Show, WatchlistStatus } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ShowPage() {
  const params = useParams();
  const id = params?.id as string;

  const [show, setShow] = useState<Show | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState<Season | null>(null);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showWatchlistMenu, setShowWatchlistMenu] = useState(false);

  const { addItem, getByTmdbId, setStatus } = useWatchlistStore();
  const watchlistItem = getByTmdbId(id);

  useEffect(() => {
    loadShow();
  }, [id]);

  useEffect(() => {
    if (show) loadSeason(selectedSeason);
  }, [selectedSeason, show]);

  async function loadShow() {
    setIsLoading(true);
    try {
      const [s, recs, sim] = await Promise.all([
        getShowDetails(id),
        getRecommendations('tv', id),
        getSimilar('tv', id),
      ]);
      setShow(s);
      setRecommendations(recs);
      setSimilar(sim);
      const firstSeason = s.seasons.find((s) => s.seasonNumber > 0)?.seasonNumber || 1;
      setSelectedSeason(firstSeason);
    } catch (err) {
      console.error('Failed to load show:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSeason(num: number) {
    try {
      const data = await getSeasonDetails(id, num);
      setSeasonData(data);
    } catch (err) {
      console.error('Failed to load season:', err);
    }
  }

  const handleWatchlistAction = (status: WatchlistStatus) => {
    if (watchlistItem) {
      setStatus(watchlistItem.id, status);
    } else if (show) {
      addItem({
        mediaType: 'show',
        tmdbId: id,
        title: show.title,
        posterPath: show.posterPath,
        status,
      });
    }
  };

  const creators = show?.createdBy || [];
  const trailer = show?.videos?.find(v => v.type === 'Trailer') || show?.videos?.[0];

  if (isLoading || !show) {
    return (
      <div className="min-h-screen pt-16">
        <div className="h-[50vh] skeleton" />
        <div className="mx-auto max-w-7xl space-y-4 p-6">
          <div className="skeleton h-10 w-72 rounded-[8px]" />
          <div className="skeleton h-5 w-full max-w-2xl rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Backdrop */}
      <div className="relative h-[55vh] min-h-[380px]">
        {show.backdropPath && (
          <Image
            src={tmdbImage(show.backdropPath, 'original')}
            alt={show.title}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Content */}
      <div className="relative -mt-36 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex gap-8 animate-slide-up">
          {/* Poster */}
          <div className="hidden flex-shrink-0 md:block">
            <div className="relative h-[330px] w-[220px] overflow-hidden rounded-[var(--glass-radius-lg)] shadow-[var(--shadow-xl)]">
              {show.posterPath ? (
                <Image src={tmdbImage(show.posterPath, 'w500')} alt={show.title} fill sizes="220px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--bg-tertiary)]">
                  <span className="text-text-muted">No Poster</span>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-[28px] font-bold text-text-primary tracking-tight sm:text-4xl">{show.title}</h1>

            {show.tagline && (
              <p className="mt-1 text-[13px] italic text-text-muted">&ldquo;{show.tagline}&rdquo;</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-text-secondary">
              <span>{show.releaseYear}</span>
              <span className="text-text-muted">&bull;</span>
              <span>{show.seasons.filter((s) => s.seasonNumber > 0).length} Seasons</span>
              <span className="text-text-muted">&bull;</span>
              <span>{show.totalEpisodes} Episodes</span>
              {show.rating > 0 && (
                <>
                  <span className="text-text-muted">&bull;</span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {show.rating.toFixed(1)}
                  </span>
                </>
              )}
              {show.status && (
                <>
                  <span className="text-text-muted">&bull;</span>
                  <span className="rounded-[8px] bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">{show.status}</span>
                </>
              )}
            </div>

            {/* Genres */}
            {show.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {show.genres.map((g) => (
                  <span key={g.id} className="rounded-[8px] bg-[var(--bg-glass-light)] px-3 py-1 text-[11px] font-medium text-text-secondary backdrop-blur-sm">
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            <div className="mt-4">
              <p className={cn('text-[14px] text-text-secondary leading-relaxed', !showFullOverview && 'line-clamp-4')}>
                {show.overview}
              </p>
              {show.overview.length > 250 && (
                <button onClick={() => setShowFullOverview(v => !v)} className="text-accent text-[13px] mt-1 hover:underline">
                  {showFullOverview ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>

            {/* Quick Facts */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {creators.length > 0 && (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Creator</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">{creators.join(', ')}</p>
                </div>
              )}
              {show.networks && show.networks.length > 0 && (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Network</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">{show.networks.join(', ')}</p>
                </div>
              )}
              {show.originCountry && show.originCountry.length > 0 && (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Origin</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">{show.originCountry.join(', ')}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/watch/show/${id}?s=${selectedSeason}&e=1`}
                className="btn-accent !px-8 !py-3 text-[14px]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21" />
                </svg>
                Watch Now
              </Link>

              {trailer && (
                <button
                  onClick={() => setShowTrailer(true)}
                  className="btn-glass !px-6 !py-3"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21" />
                  </svg>
                  Trailer
                </button>
              )}

              <div className="relative">
                <button onClick={() => setShowWatchlistMenu(v => !v)} className="btn-glass !px-4 !py-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  {watchlistItem ? watchlistItem.status : 'Add to List'}
                </button>
                {showWatchlistMenu && (
                  <div className="absolute top-full left-0 mt-2 w-44 panel-glass rounded-[12px] p-1.5 z-10 animate-scale-in">
                    {(['planned', 'watching', 'completed', 'dropped', 'on-hold'] as WatchlistStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => { handleWatchlistAction(status); setShowWatchlistMenu(false); }}
                        className={cn(
                          'w-full rounded-[8px] px-3 py-2 text-left text-[13px] capitalize transition-colors',
                          watchlistItem?.status === status ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-[var(--bg-glass-light)]'
                        )}
                      >
                        {status.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* TMDB Link */}
              <a
                href={`https://www.themoviedb.org/tv/${show.tmdbId || show.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[16px] bg-teal-500/10 px-5 py-3 text-[13px] font-semibold text-teal-300 hover:bg-teal-500/20 transition-all shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                TMDB
              </a>

              {/* SeriesGraph Link */}
              <a
                href={`https://seriesgraph.com/show/${show.tmdbId || show.id}-${show.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[16px] bg-violet-500/10 px-5 py-3 text-[13px] font-semibold text-violet-300 hover:bg-violet-500/20 transition-all shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                SeriesGraph
              </a>

            </div>
          </div>
        </div>
      </div>

      {/* Trailer Modal */}
      {showTrailer && trailer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[30px]" onClick={() => setShowTrailer(false)}>
          <div className="relative w-full max-w-4xl mx-4 aspect-video animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowTrailer(false)} className="absolute -top-10 right-0 rounded-full bg-white/10 p-2 text-white/70 hover:text-white hover:bg-white/20 transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
              className="w-full h-full rounded-[var(--glass-radius-lg)] shadow-[var(--shadow-xl)]"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* Cast Section */}
      {show.cast && show.cast.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-10">
          <h2 className="text-[15px] font-semibold text-text-primary mb-4">Cast</h2>
          <div className="flex gap-3 overflow-x-auto pb-3 scroll-row">
            {show.cast.slice(0, 15).map((person) => (
              <div key={person.id} className="flex-shrink-0 w-[100px] text-center">
                <div className="relative h-[100px] w-[100px] rounded-full overflow-hidden mx-auto bg-[var(--bg-tertiary)] shadow-[var(--shadow-sm)]">
                  {person.profilePath ? (
                    <Image src={tmdbImage(person.profilePath, 'w185')} alt={person.name} fill sizes="100px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" /></svg>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[11px] font-medium text-text-primary line-clamp-1">{person.name}</p>
                <p className="text-[10px] text-text-muted line-clamp-1">{person.character}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Season & Episode Selector */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-10">
        <h2 className="text-[15px] font-semibold text-text-primary mb-4">Episodes</h2>
        {/* Season Tabs – macOS segmented control */}
        <div className="mb-5 inline-flex items-center gap-0.5 overflow-x-auto rounded-full bg-white/[0.04] backdrop-blur-2xl p-1">
          {show.seasons
            .filter((s) => s.seasonNumber > 0)
            .map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSeason(s.seasonNumber)}
                className={cn(
                  'rounded-full px-5 py-2 text-[13px] font-medium whitespace-nowrap transition-all duration-500 ease-[var(--spring)]',
                  selectedSeason === s.seasonNumber
                    ? 'bg-accent text-white shadow-[0_2px_12px_var(--accent-glow)]'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.06]'
                )}
              >
                {s.name}
              </button>
            ))}
        </div>

        {/* Episode Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {seasonData?.episodes?.map((ep) => (
            <Link
              key={ep.id}
              href={`/watch/show/${id}?s=${selectedSeason}&e=${ep.episodeNumber}`}
              className="glass-card glass-liquid flex gap-3 p-3 group hover:border-accent/30 transition-all"
            >
              <div className="relative h-20 w-36 flex-shrink-0 overflow-hidden rounded-[10px] bg-[var(--bg-tertiary)]">
                {ep.stillPath ? (
                  <Image src={tmdbImage(ep.stillPath, 'w300')} alt={ep.name} fill sizes="144px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-[10px]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                    <polygon points="5 3 19 12 5 21" />
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0 py-1">
                <p className="text-[11px] text-text-muted">Episode {ep.episodeNumber}</p>
                <p className="text-[13px] font-medium text-text-primary truncate">{ep.name}</p>
                <p className="mt-1 text-[11px] text-text-secondary line-clamp-2">{ep.overview}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="mt-10">
          <MediaRow title="Recommended" items={recommendations} />
        </div>
      )}

      {/* Similar Shows */}
      {similar.length > 0 && (
        <div className="mt-4">
          <MediaRow title="Similar Shows" items={similar} />
        </div>
      )}
    </div>
  );
}
