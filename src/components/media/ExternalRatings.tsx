'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useAuthStore } from '@/stores/auth';

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

export default function ExternalRatings({ imdbId, title, year, vertical = false }: { imdbId?: string, title?: string, year?: string | number, vertical?: boolean }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [ratings, setRatings] = useState<Rating[] | null>(null);
  const [imdbScore, setImdbScore] = useState<string | null>(null);
  const [metascore, setMetascore] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);

  useEffect(() => {
    setRatings(null);
    setImdbScore(null);
    setMetascore(null);
    setIsUnavailable(false);
  }, [imdbId]);

  const fetchRatings = async () => {
    if (!imdbId || isLoading || isUnavailable || !isLoggedIn) return;
    setIsLoading(true);

    try {
      const url = new URL('/api/external-ratings', window.location.origin);
      url.searchParams.set('i', imdbId);
      if (title) url.searchParams.set('t', title);
      if (year) url.searchParams.set('y', String(year));

      const res = await fetch(url.toString());
      const data: OMDBResponse = await res.json();

      if (data.Response === 'True') {
        const hasImdb = data.imdbRating && data.imdbRating !== 'N/A';
        const hasRatingsArray = data.Ratings && data.Ratings.length > 0;
        const hasMetascore = data.Metascore && data.Metascore !== 'N/A';

        // Filter out IMDb from the ratings array to avoid duplicates
        const otherRatings = data.Ratings?.filter(r => !r.Source.toLowerCase().includes('internet movie')) || [];

        if (!hasImdb && otherRatings.length === 0 && !hasMetascore) {
          setIsUnavailable(true);
        } else {
          setRatings(otherRatings);
          setImdbScore(hasImdb ? data.imdbRating! : null);
          setMetascore(hasMetascore ? data.Metascore! : null);
        }
      } else {
        setIsUnavailable(true);
      }
    } catch (err) {
      console.error('Rating fetch error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!imdbId || isUnavailable || !isLoggedIn) return null;

  const showMeta = metascore && metascore !== 'N/A';
  const hasMetacriticInArray = ratings?.some(r => r.Source.toLowerCase().includes('metacritic'));

  return (
    <div className={cn("flex items-center gap-3", vertical ? "flex-col items-end" : "flex-wrap")}>
      {!ratings && !imdbScore && !metascore ? (
        <button
          onClick={fetchRatings}
          disabled={isLoading}
          className="group flex items-center gap-2 rounded-full bg-white/[0.05] px-4 py-2 text-[12px] font-medium text-text-secondary transition-all hover:bg-white/[0.1] hover:text-text-primary border border-white/5 backdrop-blur-md"
        >
          {isLoading ? (
            <svg className="h-3 w-3 animate-spin text-accent" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60 group-hover:opacity-100">
              <path d="M12 2v20M2 12h20" />
            </svg>
          )}
          {isLoading ? 'Loading...' : 'External Ratings'}
        </button>
      ) : (
        <div className={cn("flex animate-scale-in", vertical ? "flex-col gap-1.5" : "flex-wrap items-center gap-2")}>
          {imdbScore && (
            <div className="flex items-center gap-2.5 rounded-full bg-white/[0.05] px-3.5 py-1.5 border border-white/5 backdrop-blur-xl shadow-sm">
              <div className="relative h-4 w-8">
                <Image src="/IMDB.svg" alt="IMDb" fill className="object-contain" />
              </div>
              <span className="text-[13px] font-bold text-text-primary tracking-tight">{imdbScore}</span>
            </div>
          )}

          {ratings?.map((r) => {
            const isRT = r.Source.toLowerCase().includes('rotten');
            const isMeta = r.Source.toLowerCase().includes('metacritic') || r.Source.toLowerCase().includes('metascore');

            let iconPath = '';
            if (isRT) {
              const val = parseInt(r.Value.replace('%', ''));
              iconPath = val >= 60 ? '/Rotten_Tomatoes.svg' : '/Rotten_Tomatoes_rotten.svg';
            } else if (isMeta) {
              iconPath = '/Metacritic.svg';
            } else {
              return null;
            }

            return (
              <div key={r.Source} className="flex items-center gap-2.5 rounded-full bg-white/[0.05] px-3.5 py-1.5 border border-white/5 backdrop-blur-xl shadow-sm">
                <div className="relative h-5 w-5">
                  <Image src={iconPath} alt={r.Source} fill className="object-contain" />
                </div>
                <span className="text-[13px] font-bold text-text-primary tracking-tight">{r.Value}</span>
              </div>
            );
          })}

          {showMeta && !hasMetacriticInArray && (
            <div className="flex items-center gap-2.5 rounded-full bg-white/[0.05] px-3.5 py-1.5 border border-white/5 backdrop-blur-xl shadow-sm">
              <div className="relative h-5 w-5">
                <Image src="/Metacritic.svg" alt="Metacritic" fill className="object-contain" />
              </div>
              <span className="text-[13px] font-bold text-text-primary tracking-tight">{metascore}/100</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
