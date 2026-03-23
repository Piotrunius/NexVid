'use client';

import { searchMedia } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import type { MediaItem } from '@/types';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Loader2, Search, Sparkles, Star, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 
  'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 
  'Sci-Fi', 'Thriller', 'War', 'Western'
];

const VIBE_GROUPS = [
  {
    name: 'Atmosphere',
    tags: ['Dark', 'Gritty', 'Chill', 'Dreamy', 'Intense', 'Nostalgic', 'Bizarre', 'Futuristic', 'Romantic']
  },
  {
    name: 'Style',
    tags: ['Slow burn', 'Fast-paced', 'Mind-bending', 'Gory', 'Wholesome', 'Epic', 'Indie', 'Noir', 'Surreal']
  }
];

const ERAS = ['All Time', '2020s', '2010s', '2000s', '90s', '80s', 'Classics'];

export function AiAssistantModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'input' | 'loading' | 'results'>('input');
  const [mood, setMood] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [type, setType] = useState<'movie' | 'show'>('movie');
  const [era, setEra] = useState('All Time');
  const [isEraOpen, setIsEraOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([]);
  const [usage, setUsage] = useState<{ count: number; limit: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const bodyRef = useRef<HTMLDivElement>(null);
  const { glassEffect } = useSettingsStore((s) => s.settings);
  const { token, isLoggedIn } = useAuthStore();
  const isLocalUser = isLoggedIn && !token;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    if (isOpen && token) {
      fetch('/api/ai-assistant/usage', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.limit) setUsage({ count: data.count, limit: data.limit });
      })
      .catch(() => {});
    }
  }, [isOpen, token]);

  const handleToggleGenre = (genre: string) => {
    setSelectedGenres(prev => 
      prev.includes(genre) ? prev.filter(x => x !== genre) : [...prev, genre]
    );
  };

  const handleToggleMood = (tag: string) => {
    setSelectedMoods(prev => 
      prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]
    );
  };

  const handleGenerate = async () => {
    if (selectedGenres.length === 0 && selectedMoods.length === 0 && !mood.trim()) return;

    setStep('loading');
    setRecommendations([]);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          mood, 
          type, 
          selectedGenres,
          selectedMoods,
          era
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'AI request failed');
      }

      const data = await res.json();
      const rawRecs: AiRecommendation[] = data.recommendations || [];

      const enrichedRecs = (await Promise.all(
        rawRecs.map(async (rec) => {
          try {
            const searchRes = await searchMedia(rec.title);
            const match = searchRes.results.find(
              (r) =>
                (type === 'movie' ? r.mediaType === 'movie' : r.mediaType === 'show') &&
                (rec.year ? Math.abs((r.releaseYear || 0) - rec.year) <= 1 : true)
            );
            if (!match) return null;
            return { ...rec, mediaItem: match };
          } catch {
            return null;
          }
        })
      )).filter((rec): rec is AiRecommendation => rec !== null);

      setRecommendations(enrichedRecs);
      setUsage(prev => prev ? { ...prev, count: prev.count + 1 } : null);
      setStep('results');
    } catch (error: any) {
      console.error('AI Error:', error);
      setErrorMsg(error.message || 'Something went wrong');
      setStep('input');
    }
  };

  const reset = () => {
    setStep('input');
    setMood('');
    setSelectedGenres([]);
    setSelectedMoods([]);
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
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-45%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-45%" }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl p-4 outline-none"
              >
                <div 
                  className={cn(
                    "relative flex flex-col w-full max-h-[90vh] overflow-hidden rounded-2xl border shadow-2xl transition-all",
                    glassEffect 
                      ? "bg-black/80 backdrop-blur-xl border-white/10" 
                      : "bg-[#0a0a0a] border-white/10"
                  )}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-accent/20 blur-[100px] pointer-events-none" />

                  {/* Header */}
                  <div className="relative flex items-center justify-between px-6 py-4 shrink-0 z-10 border-b border-white/5 bg-black/20">
                    <div className="flex flex-col">
                      <Dialog.Title className="text-lg font-bold flex items-center gap-2 text-white">
                        <Sparkles className="w-5 h-5 text-accent" />
                        AI Assistant
                      </Dialog.Title>
                      {usage && (
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider mt-0.5 ml-7",
                          usage.count >= usage.limit ? "text-red-400" : "text-white/40"
                        )}>
                          Daily Limit: {usage.count}/{usage.limit}
                        </span>
                      )}
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Body */}
                  <div ref={bodyRef} className="flex-1 overflow-y-auto custom-scrollbar">
                    {step === 'input' && (
                      <div className="flex flex-col h-full">
                        {(errorMsg || isLocalUser) && (
                          <div className="px-6 pt-4">
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium text-center">
                              {isLocalUser ? 'AI Assistant requires a Cloud account. Please log in to your account.' : errorMsg}
                            </div>
                          </div>
                        )}
                        {/* Top Bar: Type & Era */}
                        <div className="px-6 py-4 flex flex-wrap gap-4 items-center justify-between border-b border-white/5 bg-white/[0.02]">
                          <div className="flex bg-white/5 rounded-lg p-1">
                            <button
                              onClick={() => setType('movie')}
                              className={cn(
                                "px-4 py-1.5 rounded-md text-xs font-medium transition-all",
                                type === 'movie' ? "bg-accent text-white shadow-md" : "text-white/50 hover:text-white"
                              )}
                            >
                              Movies
                            </button>
                            <button
                              onClick={() => setType('show')}
                              className={cn(
                                "px-4 py-1.5 rounded-md text-xs font-medium transition-all",
                                type === 'show' ? "bg-accent text-white shadow-md" : "text-white/50 hover:text-white"
                              )}
                            >
                              TV Shows
                            </button>
                          </div>

                          {/* Era Dropdown */}
                          <div className="relative">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white/40 uppercase">Era:</span>
                              <button
                                onClick={() => setIsEraOpen(!isEraOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all"
                              >
                                {era}
                                <ChevronDown className={cn("w-3 h-3 transition-transform", isEraOpen && "rotate-180")} />
                              </button>
                            </div>

                            <AnimatePresence>
                              {isEraOpen && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setIsEraOpen(false)} />
                                  <motion.div
                                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                    className="absolute right-0 top-full mt-2 w-32 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 py-1"
                                  >
                                    {ERAS.map((e) => (
                                      <button
                                        key={e}
                                        onClick={() => { setEra(e); setIsEraOpen(false); }}
                                        className={cn(
                                          "w-full text-left px-4 py-2 text-xs font-medium transition-colors hover:bg-white/10",
                                          era === e ? "text-accent" : "text-white/70"
                                        )}
                                      >
                                        {e}
                                      </button>
                                    ))}
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Split View */}
                        <div className="grid md:grid-cols-2 gap-6 p-6">
                          {/* Left: Genres */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Genres</label>
                              <span className="text-[10px] text-white/30">{selectedGenres.length} selected</span>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto custom-scrollbar content-start">
                              {GENRES.map(genre => (
                                <button
                                  key={genre}
                                  onClick={() => handleToggleGenre(genre)}
                                  className={cn(
                                    "px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-all grow text-center",
                                    selectedGenres.includes(genre)
                                      ? "bg-accent border-accent text-white shadow-sm"
                                      : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                                  )}
                                >
                                  {genre}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Right: Vibes */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Vibe & Style</label>
                              <span className="text-[10px] text-white/30">{selectedMoods.length} selected</span>
                            </div>
                            <div className="space-y-4 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                              {VIBE_GROUPS.map(group => (
                                <div key={group.name} className="space-y-2">
                                  <span className="text-[10px] font-bold text-accent/70 uppercase">{group.name}</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {group.tags.map(tag => (
                                      <button
                                        key={tag}
                                        onClick={() => handleToggleMood(tag)}
                                        className={cn(
                                          "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                                          selectedMoods.includes(tag)
                                            ? "bg-white text-black border-white"
                                            : "bg-transparent border-white/10 text-white/50 hover:border-white/30 hover:text-white"
                                        )}
                                      >
                                        {tag}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Search Input */}
                        <div className="px-6 pb-6 mt-auto">
                          <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-accent transition-colors" />
                            <input
                              value={mood}
                              onChange={(e) => setMood(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                              placeholder="Type specific keywords (e.g. 'Cyberpunk', 'Time Travel')..."
                              className="w-full h-12 bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all shadow-inner"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {step === 'loading' && (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 animate-fade-in min-h-[400px]">
                        <Loader2 className="w-16 h-16 text-accent animate-spin opacity-50" />
                        <div>
                          <p className="text-white text-xl font-bold">Scanning the multiverse...</p>
                          <p className="text-white/40 text-sm mt-1">Finding the best matches for your taste</p>
                        </div>
                      </div>
                    )}

                    {step === 'results' && (
                      <div className="p-4 sm:p-6 space-y-4 animate-fade-in">
                        <div className="grid gap-3 sm:gap-4">
                          {recommendations.map((rec, idx) => (
                            <div
                              key={idx}
                              className="group flex gap-3 sm:gap-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/10 rounded-2xl p-3 sm:p-4 transition-all"
                            >
                              <div className="shrink-0 w-20 sm:w-24 aspect-[2/3] bg-black/40 rounded-xl overflow-hidden relative shadow-2xl">
                                {rec.mediaItem?.posterPath ? (
                                  <Image
                                    src={`https://image.tmdb.org/t/p/w200${rec.mediaItem.posterPath}`}
                                    alt={rec.title}
                                    fill
                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white/20 text-xs text-center p-2 uppercase font-bold">{rec.title}</div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                <div>
                                  <div className="flex justify-between items-start gap-2">
                                    <h3 className="font-extrabold text-white text-base sm:text-lg leading-tight truncate pr-2">
                                      {rec.mediaItem?.title || rec.title}
                                    </h3>
                                    {rec.match_score && (
                                      <span className={cn(
                                        "shrink-0 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black uppercase",
                                        rec.match_score > 85 ? "bg-green-500 text-black shadow-[0_0_10px_rgba(34,197,94,0.3)]" : "bg-yellow-500 text-black"
                                      )}>
                                        {rec.match_score}%
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="text-[10px] sm:text-xs font-bold text-white/30">{rec.year || rec.mediaItem?.releaseYear}</span>
                                    <div className="h-0.5 w-0.5 rounded-full bg-white/10" />
                                    {rec.genres?.slice(0, 2).map(g => (
                                      <span key={g} className="text-[9px] sm:text-[10px] font-bold text-accent uppercase tracking-wider">{g}</span>
                                    ))}
                                    {rec.mediaItem && (
                                      <div className="ml-auto flex items-center gap-1 text-yellow-500 font-black text-[10px] sm:text-xs">
                                        <Star className="w-3 h-3 fill-current" />
                                        <span>{rec.mediaItem.rating.toFixed(1)}</span>
                                      </div>
                                    )}
                                  </div>

                                  <p className="text-xs sm:text-sm text-white/50 mt-2 line-clamp-2 leading-relaxed font-medium">
                                    {rec.reason}
                                  </p>
                                </div>

                                <div className="mt-3 flex gap-3">
                                  {rec.mediaItem && (
                                    <Link
                                      href={rec.mediaItem.mediaType === 'movie' ? `/movie/${rec.mediaItem.id}` : `/show/${rec.mediaItem.id}`}
                                      onClick={onClose}
                                      className="px-4 sm:px-6 py-1.5 sm:py-2 bg-accent text-white text-[10px] sm:text-xs font-black rounded-xl hover:brightness-110 transition-all shadow-lg shadow-accent/20 uppercase tracking-widest"
                                    >
                                      Watch
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
                    <div className="px-6 py-4 border-t border-white/5 bg-black/40 shrink-0 z-10">
                      {step === 'input' ? (
                        <button
                          onClick={handleGenerate}
                          disabled={isLocalUser || (selectedGenres.length === 0 && selectedMoods.length === 0 && !mood.trim()) || (usage?.count || 0) >= (usage?.limit || 5)}
                          className="group w-full py-4 bg-accent text-white font-bold text-sm sm:text-base uppercase tracking-wider rounded-xl hover:bg-accent/90 hover:shadow-[0_0_25px_var(--accent-glow)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-3"
                        >
                          <Sparkles className="w-5 h-5 sm:w-4 sm:h-4" />
                          {isLocalUser ? "Cloud Account Required" : (usage && usage.count >= usage.limit ? "Daily Limit Reached" : "Generate recommendations")}
                        </button>
                      ) : (
                        <button
                          onClick={reset}
                          className="w-full py-3.5 border border-white/10 text-white font-black uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all"
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
