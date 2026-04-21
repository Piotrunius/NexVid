'use client';

import { searchMedia } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { LIMITS } from '@/lib/validation';
import type { MediaItem } from '@/types';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Search, Sparkles, Star, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from './Toaster';

interface AiRecommendation {
  title: string;
  original_title?: string;
  year?: number;
  genres?: string[];
  reason: string;
  match_score?: number;
  mediaItem?: MediaItem;
}

const GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'War',
];

const ERAS = ['All Time', '2020s', '2010s', '2000s', '90s', '80s', 'Classics'];

export function AiAssistantModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'input' | 'loading' | 'results'>('input');
  const [mood, setMood] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [type, setType] = useState<'movie' | 'show'>('movie');
  const [era, setEra] = useState('All Time');
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([]);
  const [usage, setUsage] = useState<{ count: number; limit: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const { groqApiKey, glassEffect } = useSettingsStore((s) => s.settings);
  const { authToken, isLoggedIn } = useAuthStore();

  const hasOwnKey = groqApiKey && groqApiKey !== '__PUBLIC_GROQ_KEY__';
  const isLocked = !authToken && !hasOwnKey;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    if (isOpen && authToken) {
      fetch('/api/ai-assistant/usage', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.limit) setUsage({ count: data.count, limit: data.limit });
        })
        .catch(() => {});
    }
  }, [isOpen, authToken]);

  const handleToggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((x) => x !== genre) : [...prev, genre],
    );
  };

  const handleGenerate = async () => {
    // mood is optional, it can add context but genres are the main filter.

    if (isLocked) {
      toast('AI Assistant requires a Cloud account or your own Groq API key in Settings.', 'error');
      setStep('input');
      return;
    }

    setStep('loading');
    setRecommendations([]);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          mood,
          type,
          selectedGenres,
          era,
          groqApiKey,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'AI request failed');
      }

      const data = await res.json();
      const rawRecs: AiRecommendation[] = data.recommendations || [];

      const enrichedRecs = (
        await Promise.all(
          rawRecs.map(async (rec) => {
            try {
              const searchRes = await searchMedia(rec.title);
              const match = searchRes.results.find(
                (r) =>
                  (type === 'movie' ? r.mediaType === 'movie' : r.mediaType === 'show') &&
                  (rec.year ? Math.abs((r.releaseYear || 0) - rec.year) <= 1 : true),
              );
              if (!match) return null;
              return { ...rec, mediaItem: match };
            } catch {
              return null;
            }
          }),
        )
      ).filter((rec) => rec !== null) as AiRecommendation[];

      setRecommendations(enrichedRecs);
      setUsage((prev) => (prev ? { ...prev, count: prev.count + 1 } : null));
      setStep('results');
    } catch (error: any) {
      console.error('AI Error:', error);
      const msg = error.message || 'Something went wrong';
      setErrorMsg(msg);
      toast(msg, 'error');
      setStep('input');
    }
  };

  const reset = () => {
    setStep('input');
    setMood('');
    setSelectedGenres([]);
    setEra('All Time');
    setRecommendations([]);
    setErrorMsg(null);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-45%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-45%' }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="fixed left-1/2 top-1/2 z-50 w-full max-w-[min(96vw,900px)] p-3 outline-none sm:p-4"
              >
                <div
                  className={cn(
                    'relative flex max-h-[95vh] w-full flex-col overflow-hidden rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.65)] transition-all',
                    glassEffect
                      ? 'bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_40%,rgba(0,0,0,0.35)_100%)] backdrop-blur-2xl'
                      : 'bg-[#050608]/95',
                  )}
                >
                  {/* Header */}
                  <div className="relative z-10 flex shrink-0 items-center justify-between bg-black/25 px-5 py-4 sm:px-6">
                    <div className="flex flex-col">
                      <Dialog.Title className="flex items-center gap-2 text-lg font-bold text-white">
                        <Sparkles className="h-5 w-5 text-accent" />
                        AI Assistant
                      </Dialog.Title>
                      <p className="mt-0.5 text-[11px] text-white/45">
                        Curated picks based on genre and vibe
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Body */}
                  <div ref={bodyRef} className="custom-scrollbar flex-1 overflow-y-auto">
                    {step === 'input' && (
                      <div className="flex h-full flex-col">
                        {/* Top Bar: Type & Era */}
                        <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.02] px-5 py-4 sm:px-6">
                          <div className="flex rounded-full bg-white/[0.05] p-1">
                            <button
                              onClick={() => setType('movie')}
                              className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] font-black uppercase tracking-wider outline-none transition-all focus:outline-none focus-visible:outline-none ${type === 'movie' ? 'border-accent-glow bg-accent-muted text-accent' : 'border-transparent bg-transparent text-white/40 hover:text-white'}`}
                            >
                              Movies
                            </button>
                            <button
                              onClick={() => setType('show')}
                              className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] font-black uppercase tracking-wider outline-none transition-all focus:outline-none focus-visible:outline-none ${type === 'show' ? 'border-accent-glow bg-accent-muted text-accent' : 'border-transparent bg-transparent text-white/40 hover:text-white'}`}
                            >
                              TV Shows
                            </button>
                          </div>

                          {/* Era Chips (desktop) */}
                          <div className="hidden w-full sm:block sm:w-auto">
                            <div className="scrollbar-none flex touch-pan-x items-center justify-end gap-2 overflow-x-auto px-1 py-2">
                              {ERAS.map((e) => (
                                <button
                                  key={e}
                                  onClick={() => setEra(e)}
                                  className={`flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] font-black uppercase tracking-wider outline-none transition-all focus:outline-none focus-visible:outline-none ${era === e ? 'border-accent-glow bg-accent-muted text-accent' : 'border-transparent bg-transparent text-white/40 hover:text-white'}`}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Era select (mobile) */}
                          <div className="block w-full sm:hidden">
                            <select
                              value={era}
                              onChange={(e) => setEra(e.target.value)}
                              className="w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-accent"
                            >
                              {ERAS.map((e) => (
                                <option key={e} value={e} className="bg-[#0a0a0a] text-white">
                                  {e}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Split View */}
                        <div className="grid gap-5 p-5 sm:p-6">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold uppercase tracking-widest text-white/40">
                                Genres
                              </label>
                            </div>
                            <div className="custom-scrollbar flex max-h-[220px] flex-wrap content-start gap-2 overflow-y-auto">
                              {GENRES.map((genre) => (
                                <button
                                  key={genre}
                                  onClick={() => handleToggleGenre(genre)}
                                  className={`flex grow items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] font-black uppercase tracking-wider outline-none transition-all focus:outline-none focus-visible:outline-none ${selectedGenres.includes(genre) ? 'border-accent-glow bg-accent-muted text-accent' : 'border-transparent bg-transparent text-white/40 hover:text-white'}`}
                                >
                                  {genre}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Search Input */}
                        <div className="mt-auto px-5 pb-5 sm:px-6 sm:pb-6">
                          <div className="group relative">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30 transition-colors group-focus-within:text-accent" />
                            <input
                              value={mood}
                              onChange={(e) => setMood(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                              placeholder="Type titles, genres, keywords or just anything you can think of..."
                              className="focus:border-accent/45 h-12 w-full appearance-none rounded-xl border border-transparent bg-white/5 pl-11 pr-4 text-sm text-white shadow-inner outline-none transition-all placeholder:text-white/20 focus:outline-none focus:ring-0 focus-visible:outline-none"
                              maxLength={LIMITS.AI_ASSISTANT_MOOD_MAX}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {step === 'loading' && (
                      <div className="flex h-full min-h-[400px] animate-fade-in flex-col items-center justify-center space-y-4 text-center">
                        <Loader2 className="h-16 w-16 animate-spin text-accent opacity-50" />
                        <div>
                          <p className="text-xl font-bold text-white">Scanning the multiverse...</p>
                          <p className="mt-1 text-sm text-white/40">
                            Finding the best matches for your taste
                          </p>
                        </div>
                      </div>
                    )}

                    {step === 'results' && (
                      <div className="animate-fade-in space-y-4 p-4 sm:p-6">
                        <div className="grid gap-3 sm:gap-4">
                          {recommendations.map((rec, idx) => (
                            <div
                              key={idx}
                              className="group flex w-full min-w-0 flex-col gap-4 rounded-2xl bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] sm:flex-row"
                            >
                              <div className="relative mx-auto aspect-[2/3] w-full max-w-[120px] shrink-0 overflow-hidden rounded-xl bg-black/40 shadow-2xl sm:mx-0 sm:aspect-[2/3] sm:w-24 sm:max-w-[160px]">
                                {rec.mediaItem?.posterPath ? (
                                  <Image
                                    src={`https://image.tmdb.org/t/p/w200${rec.mediaItem.posterPath}`}
                                    alt={rec.title}
                                    fill
                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs font-bold uppercase text-white/20">
                                    {rec.title}
                                  </div>
                                )}
                              </div>

                              <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="truncate pr-2 text-base font-extrabold leading-tight text-white sm:text-lg">
                                      {rec.mediaItem?.title || rec.title}
                                    </h3>
                                    {rec.match_score && (
                                      <span
                                        className={cn(
                                          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase',
                                          rec.match_score > 85
                                            ? 'bg-green-500 text-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                                            : 'bg-yellow-500 text-black',
                                        )}
                                      >
                                        {rec.match_score}%
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-1">
                                    <span className="text-xs font-bold text-white/30">
                                      {rec.year || rec.mediaItem?.releaseYear}
                                    </span>
                                    <div className="h-0.5 w-0.5 rounded-full bg-white/10" />
                                    {rec.genres?.slice(0, 2).map((g) => (
                                      <span
                                        key={g}
                                        className="text-[10px] font-bold uppercase tracking-wider text-accent"
                                      >
                                        {g}
                                      </span>
                                    ))}
                                    {rec.mediaItem && (
                                      <div className="ml-auto flex items-center gap-1 text-xs font-black text-yellow-500">
                                        <Star className="h-3 w-3 fill-current" />
                                        <span>{rec.mediaItem.rating.toFixed(1)}</span>
                                      </div>
                                    )}
                                  </div>

                                  <p className="mt-3 line-clamp-3 text-sm font-medium leading-relaxed text-white/50 sm:mt-2 sm:line-clamp-2">
                                    {rec.reason}
                                  </p>
                                </div>

                                <div className="mt-4 flex gap-3 sm:mt-3">
                                  {rec.mediaItem && (
                                    <Link
                                      href={
                                        rec.mediaItem.mediaType === 'movie'
                                          ? `/movie/${rec.mediaItem.id}`
                                          : `/show/${rec.mediaItem.id}`
                                      }
                                      onClick={onClose}
                                      className="shadow-accent/20 w-full rounded-xl bg-accent px-6 py-2.5 text-center text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all hover:brightness-110 sm:w-auto sm:py-2"
                                    >
                                      Watch Now
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {(step === 'input' || step === 'results') && (
                    <div className="z-10 shrink-0 bg-black/35 px-5 py-4 sm:px-6">
                      {step === 'input' ? (
                        <button
                          onClick={handleGenerate}
                          disabled={selectedGenres.length === 0 && !mood.trim()}
                          className="hover:bg-accent/90 group flex w-full items-center justify-center gap-3 rounded-xl bg-accent py-4 text-sm font-bold uppercase tracking-wider text-white transition-all duration-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                        >
                          {isLocked
                            ? 'Cloud Account or API Key Required'
                            : 'Generate recommendations'}
                        </button>
                      ) : (
                        <button
                          onClick={reset}
                          className="w-full rounded-xl border border-white/10 py-3.5 font-black uppercase tracking-widest text-white transition-all hover:bg-white/5"
                        >
                          Reset & Try again
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
