'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

interface Rating {
  Source: string;
  Value: string;
}

interface OMDBResponse {
  Ratings?: Rating[];
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Response: string;
  Error?: string;
}

export default function ExternalRatings({
  imdbId,
  title,
  year,
  vertical = false,
}: {
  imdbId?: string;
  title?: string;
  year?: string | number;
  vertical?: boolean;
}) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { omdbApiKey } = useSettingsStore((s) => s.settings);
  const [ratings, setRatings] = useState<Rating[] | null>(null);
  const [imdbScore, setImdbScore] = useState<string | null>(null);
  const [metascore, setMetascore] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const hasOwnKey = Boolean(omdbApiKey && omdbApiKey !== '__PUBLIC_OMDB_KEY__');
  const canShow = isLoggedIn || hasOwnKey;

  useEffect(() => {
    setRatings(null);
    setImdbScore(null);
    setMetascore(null);
    setIsUnavailable(false);
  }, [imdbId]);

  const fetchRatings = async () => {
    if (!imdbId || isLoading || isUnavailable || !canShow) return;

    setIsLoading(true);

    try {
      const url = new URL('/api/external-ratings', window.location.origin);
      url.searchParams.set('i', imdbId);
      if (title) url.searchParams.set('t', title);
      if (year) url.searchParams.set('y', String(year));
      if (omdbApiKey) url.searchParams.set('apikey', omdbApiKey);

      const res = await fetch(url.toString());
      const data: OMDBResponse = await res.json();

      if (data.Response === 'True') {
        const hasImdb = Boolean(data.imdbRating && data.imdbRating !== 'N/A');
        const hasRatingsArray = Boolean(data.Ratings && data.Ratings.length > 0);
        const hasMetascore = Boolean(data.Metascore && data.Metascore !== 'N/A');

        const otherRatings =
          data.Ratings?.filter((r) => !r.Source.toLowerCase().includes('internet movie')) || [];

        if (!hasImdb && otherRatings.length === 0 && !hasMetascore) {
          setIsUnavailable(true);
          setRatings(null);
          setImdbScore(null);
          setMetascore(null);
        } else {
          setRatings(otherRatings);
          setImdbScore(hasImdb ? data.imdbRating! : null);
          setMetascore(hasMetascore ? data.Metascore! : null);
        }
      } else {
        setIsUnavailable(true);
        setRatings(null);
        setImdbScore(null);
        setMetascore(null);
      }
    } catch (err) {
      console.error('Rating fetch error', err);
      setIsUnavailable(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (!imdbId || isUnavailable || !canShow) return null;

  const showMeta = metascore && metascore !== 'N/A';
  const hasMetacriticInArray = ratings?.some((r) => r.Source.toLowerCase().includes('metacritic'));

  return (
    <div className={cn('flex items-center gap-3', vertical ? 'flex-col items-end' : 'flex-wrap')}>
      {!ratings && !imdbScore && !metascore ? (
        <button
          onClick={fetchRatings}
          disabled={isLoading}
          className="group flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-[10px] font-medium text-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-all hover:bg-white/20 hover:text-white"
        >
          {isLoading ? (
            <svg className="h-3 w-3 animate-spin text-accent" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="opacity-60 group-hover:opacity-100"
            >
              <path d="M12 2v20M2 12h20" />
            </svg>
          )}
          {isLoading ? 'Loading...' : 'External Ratings'}
        </button>
      ) : (
        <div
          className={cn(
            'flex animate-scale-in',
            vertical ? 'flex-col gap-1.5' : 'flex-wrap items-center gap-2',
          )}
        >
          {imdbScore && (
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
              <div className="relative h-4 w-8">
                <Image src="/IMDB.svg" alt="IMDb" fill className="object-contain" />
              </div>
              <span className="text-[10px] font-bold text-white">{imdbScore}</span>
            </div>
          )}

          {ratings?.map((r) => {
            const isRT = r.Source.toLowerCase().includes('rotten');
            const isMeta =
              r.Source.toLowerCase().includes('metacritic') ||
              r.Source.toLowerCase().includes('metascore');

            let iconPath = '';
            if (isRT) {
              const val = parseInt(r.Value.replace('%', ''), 10);
              iconPath = val >= 60 ? '/Rotten_Tomatoes.svg' : '/Rotten_Tomatoes_rotten.svg';
            } else if (isMeta) {
              iconPath = '/Metacritic.svg';
            } else {
              return null;
            }

            return (
              <div
                key={r.Source}
                className="flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.3)]"
              >
                <div className="relative h-4 w-4">
                  <Image src={iconPath} alt={r.Source} fill className="object-contain" />
                </div>
                <span className="text-[10px] text-white">{r.Value}</span>
              </div>
            );
          })}

          {showMeta && !hasMetacriticInArray && (
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
              <div className="relative h-4 w-4">
                <Image src="/Metacritic.svg" alt="Metacritic" fill className="object-contain" />
              </div>
              <span className="text-[10px] text-white">{metascore}/100</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
