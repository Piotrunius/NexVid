'use client';

import { normalizeMediaType } from '@/lib/mediaType';
import { tmdbImage } from '@/lib/utils';
import type { MediaItem } from '@/types';
import { Info, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface FeaturedHeroClientProps {
  items: MediaItem[];
}

const INTERVAL = 5000;

export function FeaturedHeroClient({ items }: FeaturedHeroClientProps) {
  const [featuredItems, setFeaturedItems] = useState<MediaItem[]>(() => items.slice(0, 5));
  const [currentIndex, setCurrentIndex] = useState(0);
  const lengthRef = useRef(items.slice(0, 5).length);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % lengthRef.current);
    }, INTERVAL);
  };

  // Keep lengthRef in sync
  useEffect(() => {
    lengthRef.current = featuredItems.length;
  }, [featuredItems.length]);

  // Shuffle on mount
  useEffect(() => {
    if (items.length > 5) {
      const first = items[0];
      const rest = [...items.slice(1)].sort(() => 0.5 - Math.random());
      setFeaturedItems([first, ...rest.slice(0, 4)]);
    } else {
      setFeaturedItems(items.slice(0, 5));
    }
  }, [items]);

  // Simple always-running interval — restartable
  useEffect(() => {
    startInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (featuredItems.length === 0) {
    return <section className="relative h-[90vh] min-h-[640px] animate-pulse bg-black" />;
  }

  return (
    <section className="relative h-[90vh] min-h-[640px] overflow-hidden bg-black">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes nxBar {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        .nx-bar {
          animation: nxBar ${INTERVAL}ms linear forwards;
          transform-origin: top;
        }
        @keyframes nxBarH {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        .nx-bar-h {
          animation: nxBarH ${INTERVAL}ms linear forwards;
          transform-origin: left;
        }
      `,
        }}
      />

      {/* Background crossfade */}
      {featuredItems.map((item, index) => (
        <div
          key={`bg-${item.tmdbId}`}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === currentIndex ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Image
            src={tmdbImage(item.backdropPath, 'original')}
            alt={item.title}
            fill
            priority={index === 0}
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />
        </div>
      ))}

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-start pt-20">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16">
          <div className="relative h-[260px] max-w-[38rem] sm:h-[280px]">
            {featuredItems.map((item, index) => {
              const isActive = index === currentIndex;
              const featuredType = normalizeMediaType(item.mediaType);
              return (
                <div
                  key={`content-${item.tmdbId}`}
                  className={`absolute inset-0 flex flex-col justify-center gap-4 transition-opacity duration-700 ${
                    isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-[10px]">
                      {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                    </span>
                    <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-[10px]">
                      {item.releaseYear || 'N/A'}
                    </span>
                    {(item.voteAverage ?? 0) > 0 && (
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-200 backdrop-blur-[10px]">
                        {((item.voteAverage ?? 0) * 10).toFixed(0)}% Match
                      </span>
                    )}
                  </div>

                  <h1 className="text-[34px] font-black leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-[44px] lg:text-[52px]">
                    {item.title}
                  </h1>

                  <p className="line-clamp-2 text-[14px] leading-[1.6] text-white/75 drop-shadow-md sm:text-[15px]">
                    {item.overview}
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/watch/${featuredType}/${item.tmdbId}`}
                      className="btn-accent group relative overflow-hidden !px-7 !py-3 text-[14px] font-bold"
                    >
                      <Play className="h-4 w-4 fill-current stroke-[1.85] transition-transform group-hover:scale-110" />
                      Watch Now
                    </Link>
                    <Link
                      href={`/${featuredType}/${item.tmdbId}`}
                      className="btn-glass flex items-center gap-2 !px-5 !py-3 text-[14px] font-bold"
                    >
                      <Info className="h-4 w-4" />
                      More Info
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Indicators: bottom bar on mobile / vertical pills on desktop ── */}
      {featuredItems.length > 1 &&
        (() => {
          const dots = featuredItems.map((_, index) => {
            const isActive = index === currentIndex;
            const isPast = index < currentIndex;
            const handleClick = () => {
              setCurrentIndex(index);
              startInterval();
            };
            return { isActive, isPast, handleClick, index };
          });

          return (
            <>
              {/* Mobile: horizontal pill bars anchored near the bottom */}
              <div className="absolute bottom-28 left-1/2 z-20 flex h-1.5 -translate-x-1/2 items-center gap-2 sm:hidden">
                {dots.map(({ isActive, isPast, handleClick, index }) => (
                  <button
                    key={`mob-${index}`}
                    aria-label={`Go to slide ${index + 1}`}
                    onClick={handleClick}
                    className={`h-1.5 cursor-pointer overflow-hidden rounded-full backdrop-blur-sm transition-all duration-500 ease-in-out ${
                      isActive ? 'w-7 bg-white/25' : 'w-3 bg-white/35 hover:bg-white/55'
                    }`}
                  >
                    {isActive ? (
                      <div
                        key={`mob-bar-${currentIndex}`}
                        className="nx-bar-h h-full w-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                      />
                    ) : (
                      <div
                        className="h-full w-full bg-white transition-opacity duration-300"
                        style={{ opacity: isPast ? 0.85 : 0 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Desktop: vertical pills on right edge */}
              <div className="absolute right-6 top-1/2 z-20 hidden h-48 -translate-y-1/2 flex-col gap-2.5 sm:flex lg:right-10 xl:right-14 2xl:right-16">
                {dots.map(({ isActive, isPast, handleClick, index }) => (
                  <button
                    key={`desk-${index}`}
                    aria-label={`Go to slide ${index + 1}`}
                    onClick={handleClick}
                    className={`w-1.5 cursor-pointer overflow-hidden rounded-full backdrop-blur-sm transition-all duration-500 ease-in-out ${
                      isActive ? 'flex-1 bg-white/20' : 'h-6 bg-white/30 hover:bg-white/50'
                    }`}
                  >
                    {isActive ? (
                      <div
                        key={`desk-bar-${currentIndex}`}
                        className="nx-bar h-full w-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                      />
                    ) : (
                      <div
                        className="h-full w-full bg-white transition-opacity duration-300"
                        style={{ opacity: isPast ? 0.85 : 0 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </>
          );
        })()}
    </section>
  );
}
