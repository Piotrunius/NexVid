/* ============================================
   Movie Details Page – macOS glass design
   ============================================ */

'use client';

import { MediaRow } from '@/components/media/MediaCard';
import { getMovieDetails, getRecommendations, getSimilar } from '@/lib/tmdb';
import { cn, formatRuntime, tmdbImage } from '@/lib/utils';
import { useWatchlistStore } from '@/stores/watchlist';
import type { MediaItem, Movie, WatchlistStatus } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function MoviePage() {
  const params = useParams();
  const id = params?.id as string;

  const [movie, setMovie] = useState<Movie | null>(null);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showWatchlistMenu, setShowWatchlistMenu] = useState(false);
  const castRowRef = useRef<HTMLDivElement>(null);

  const { addItem, getByTmdbId, setStatus } = useWatchlistStore();
  const watchlistItem = getByTmdbId(id);

  useEffect(() => {
    loadMovie();
  }, [id]);

  async function loadMovie() {
    setIsLoading(true);
    try {
      const [m, recs, sim] = await Promise.all([
        getMovieDetails(id),
        getRecommendations('movie', id),
        getSimilar('movie', id),
      ]);
      setMovie(m);
      setRecommendations(recs);
      setSimilar(sim);
    } catch (err) {
      console.error('Failed to load movie:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleWatchlistAction = (status: WatchlistStatus) => {
    if (watchlistItem) {
      setStatus(watchlistItem.id, status);
    } else if (movie) {
      addItem({
        mediaType: 'movie',
        tmdbId: id,
        title: movie.title,
        posterPath: movie.posterPath,
        status,
      });
    }
  };

  const director = movie?.crew?.find(c => c.job === 'Director');
  const writers = movie?.crew?.filter(c => c.job === 'Writer' || c.job === 'Screenplay') || [];
  const producers = movie?.crew?.filter(c => c.job === 'Producer') || [];
  const trailer = movie?.videos?.find(v => v.type === 'Trailer') || movie?.videos?.[0];

  const scrollCast = (direction: 'left' | 'right') => {
    const row = castRowRef.current;
    if (!row) return;
    const delta = Math.max(220, row.clientWidth * 0.65);
    row.scrollBy({ left: direction === 'left' ? -delta : delta, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-16">
        <div className="h-[60vh] skeleton" />
        <div className="mx-auto max-w-7xl space-y-4 p-6">
          <div className="skeleton h-10 w-72 rounded-[8px]" />
          <div className="skeleton h-5 w-full max-w-2xl rounded" />
          <div className="skeleton h-5 w-full max-w-xl rounded" />
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-16">
        <p className="text-text-muted">Movie not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Backdrop */}
      <div className="relative h-[60vh] min-h-[400px]">
        {movie.backdropPath && (
          <Image
            src={tmdbImage(movie.backdropPath, 'original')}
            alt={movie.title}
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
      <div className="relative -mt-40 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex gap-8 animate-slide-up">
          {/* Poster */}
          <div className="hidden flex-shrink-0 md:block">
            <div className="relative h-[360px] w-[240px] overflow-hidden rounded-[var(--glass-radius-lg)] shadow-[var(--shadow-xl)]">
              {movie.posterPath ? (
                <Image
                  src={tmdbImage(movie.posterPath, 'w500')}
                  alt={movie.title}
                  fill
                  sizes="240px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-black">
                  <span className="text-text-muted">No Poster</span>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-[28px] font-bold text-text-primary tracking-tight sm:text-4xl">
              {movie.title}
            </h1>

            {movie.tagline && (
              <p className="mt-1 text-[13px] italic text-text-muted">&ldquo;{movie.tagline}&rdquo;</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-text-secondary">
              <span>{movie.releaseYear}</span>
              {movie.runtime > 0 && (
                <>
                  <span className="text-text-muted">&bull;</span>
                  <span>{formatRuntime(movie.runtime)}</span>
                </>
              )}
              {movie.rating > 0 && (
                <>
                  <span className="text-text-muted">&bull;</span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {movie.rating.toFixed(1)}
                  </span>
                </>
              )}
              {movie.status && (
                <>
                  <span className="text-text-muted">&bull;</span>
                  <span className="rounded-[8px] bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">{movie.status}</span>
                </>
              )}
            </div>

            {/* Genres */}
            {movie.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {movie.genres.map((g) => (
                  <span
                    key={g.id}
                    className="rounded-[8px] bg-[var(--bg-glass-light)] px-3 py-1 text-[11px] font-medium text-text-secondary backdrop-blur-sm"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            <div className="mt-4">
              <p className={cn('text-[14px] text-text-secondary leading-relaxed', !showFullOverview && 'line-clamp-4')}>
                {movie.overview}
              </p>
              {movie.overview.length > 300 && (
                <button onClick={() => setShowFullOverview(v => !v)} className="text-accent text-[13px] mt-1 hover:underline">
                  {showFullOverview ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>

            {/* Quick Facts */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {director && (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Director</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">{director.name}</p>
                </div>
              )}
              {writers.length > 0 && (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Writer</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">{writers.map(w => w.name).join(', ')}</p>
                </div>
              )}
              {movie.budget && movie.budget > 0 ? (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Budget</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">${(movie.budget / 1_000_000).toFixed(0)}M</p>
                </div>
              ) : null}
              {movie.revenue && movie.revenue > 0 ? (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Revenue</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">${(movie.revenue / 1_000_000).toFixed(0)}M</p>
                </div>
              ) : null}
              {movie.spokenLanguages && movie.spokenLanguages.length > 0 && (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Languages</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">{movie.spokenLanguages.slice(0, 3).join(', ')}</p>
                </div>
              )}
              {movie.productionCompanies && movie.productionCompanies.length > 0 && (
                <div className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                  <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Studio</p>
                  <p className="text-[13px] text-text-primary font-medium mt-0.5">{movie.productionCompanies[0]}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/watch/movie/${id}`}
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

              {/* Watchlist dropdown */}
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
                          watchlistItem?.status === status
                            ? 'bg-accent/15 text-accent'
                            : 'text-text-secondary hover:bg-[var(--bg-glass-light)]'
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
                href={`https://www.themoviedb.org/movie/${movie.tmdbId || movie.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[16px] bg-teal-500/10 px-5 py-3 text-[13px] font-semibold text-teal-300 hover:bg-teal-500/20 transition-all shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                TMDB
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
      {movie.cast && movie.cast.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-text-primary">Cast</h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => scrollCast('left')}
                aria-label="Scroll cast left"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-all duration-300 hover:bg-white/[0.12] hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <button
                onClick={() => scrollCast('right')}
                aria-label="Scroll cast right"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-all duration-300 hover:bg-white/[0.12] hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </div>
          </div>
          <div ref={castRowRef} className="flex gap-3 overflow-x-auto pb-3 scroll-row">
            {movie.cast.slice(0, 15).map((person, index) => (
              <div key={`${person.id}-${index}`} className="flex-shrink-0 w-[100px] text-center">
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

      {/* Production Details */}
      {(producers.length > 0 || (movie.productionCompanies && movie.productionCompanies.length > 1)) && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-8">
          <h2 className="text-[15px] font-semibold text-text-primary mb-4">Production</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {movie.productionCompanies?.map((company, i) => (
              <div key={i} className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Company</p>
                <p className="text-[13px] text-text-primary font-medium mt-0.5">{company}</p>
              </div>
            ))}
            {producers.slice(0, 4).map((p) => (
              <div key={p.id} className="rounded-[20px] bg-[var(--bg-glass)] p-4 backdrop-blur-[20px]">
                <p className="text-[10px] uppercase text-text-muted font-semibold tracking-wider">Producer</p>
                <p className="text-[13px] text-text-primary font-medium mt-0.5">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="mt-10">
          <MediaRow title="Recommended" items={recommendations} enableControls />
        </div>
      )}

      {/* Similar Movies */}
      {similar.length > 0 && (
        <div className="mt-4">
          <MediaRow title="Similar Movies" items={similar} enableControls />
        </div>
      )}
    </div>
  );
}
