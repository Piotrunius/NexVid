'use client';

import { scrapeAllSources } from '@/lib/providers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import type { MediaType, SourceResult } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId: string;
  mediaType: MediaType;
  title: string;
  releaseYear: number;
  initialSeason?: number;
  initialEpisode?: number;
  seasons?: Array<{ seasonNumber: number; episodeCount: number }>;
}

export function DownloadModal({
  isOpen,
  onClose,
  tmdbId,
  mediaType,
  title,
  releaseYear,
  initialSeason = 1,
  initialEpisode = 1,
  seasons = [],
}: DownloadModalProps) {
  const [season, setSeason] = useState(initialSeason);
  const [episode, setEpisode] = useState(initialEpisode);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SourceResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { febboxApiKey, customAccentHex, accentColor, glassEffect } = useSettingsStore(
    (s) => s.settings,
  );
  const { authToken: sessionToken } = useAuthStore();

  const resolvedAccentHex = useMemo(() => {
    if (accentColor === 'custom') return customAccentHex || '#6366f1';
    const mapping: Record<string, string> = {
      indigo: '#6366f1',
      violet: '#8b5cf6',
      rose: '#f43f5e',
      emerald: '#10b981',
      amber: '#f59e0b',
      cyan: '#06b6d4',
      sky: '#0ea5e9',
      lime: '#84cc16',
      orange: '#f97316',
      fuchsia: '#d946ef',
      teal: '#14b8a6',
      red: '#ef4444',
    };
    return mapping[accentColor] || '#6366f1';
  }, [accentColor, customAccentHex]);

  const fetchLinks = async () => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    try {
      const scrapeResults = await scrapeAllSources({
        tmdbId,
        title,
        releaseYear,
        mediaType,
        season: mediaType === 'show' ? season : undefined,
        episode: mediaType === 'show' ? episode : undefined,
        febboxCookie: febboxApiKey,
        sessionToken,
        accentColor: resolvedAccentHex,
        excludeSources: ['pobreflix'],
      });

      if (scrapeResults.length === 0) {
        setError('No sources found for this selection.');
      } else {
        setResults(scrapeResults);
      }
    } catch (err) {
      setError('Failed to fetch sources.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLinks();
    }
  }, [isOpen, season, episode]);

  const currentSeasonData = seasons.find((s) => s.seasonNumber === season);
  const directLinks = results.filter((r) => r.stream.type === 'file' || r.stream.type === 'hls');

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
                className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-45%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-45%' }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="fixed left-1/2 top-1/2 z-[100] w-full max-w-xl p-3 outline-none sm:p-4"
              >
                <div
                  className={cn(
                    'relative flex max-h-[95vh] w-full flex-col overflow-hidden rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.65)] transition-all',
                    glassEffect
                      ? 'bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_40%,rgba(0,0,0,0.35)_100%)] backdrop-blur-2xl'
                      : 'bg-[#050608]/95',
                  )}
                >
                  <div className="relative z-10 flex shrink-0 items-center justify-between bg-black/25 px-5 py-4 sm:px-6">
                    <div className="flex flex-col">
                      <Dialog.Title className="flex items-center gap-2 text-lg font-bold text-white">
                        <Download className="h-5 w-5 text-accent" />
                        Media Downloader
                      </Dialog.Title>
                      <p className="mt-0.5 text-[11px] text-white/45">{title}</p>
                    </div>
                    <button
                      onClick={onClose}
                      className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="custom-scrollbar flex-1 overflow-y-auto p-5 sm:p-6">
                    {mediaType === 'show' && (
                      <div className="mb-6 grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-white/30">
                            Season
                          </label>
                          <select
                            value={season}
                            onChange={(e) => {
                              setSeason(Number(e.target.value));
                              setEpisode(1);
                            }}
                            className="focus:border-accent/45 w-full appearance-none rounded-xl border border-transparent bg-white/5 px-4 py-2 text-sm text-white shadow-inner outline-none transition-all focus:ring-0"
                          >
                            {seasons.map((s) => (
                              <option
                                key={s.seasonNumber}
                                value={s.seasonNumber}
                                className="bg-[#0a0a0a]"
                              >
                                Season {s.seasonNumber}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-white/30">
                            Episode
                          </label>
                          <select
                            value={episode}
                            onChange={(e) => setEpisode(Number(e.target.value))}
                            className="focus:border-accent/45 w-full appearance-none rounded-xl border border-transparent bg-white/5 px-4 py-2 text-sm text-white shadow-inner outline-none transition-all focus:ring-0"
                          >
                            {Array.from({
                              length: currentSeasonData?.episodeCount || 1,
                            }).map((_, i) => (
                              <option key={i + 1} value={i + 1} className="bg-[#0a0a0a]">
                                Episode {i + 1}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="space-y-6">
                      {isLoading ? (
                        <div className="py-12 text-center">
                          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                          <p className="mt-4 text-[13px] text-white/40">
                            Searching all providers...
                          </p>
                        </div>
                      ) : error ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 py-12 text-center">
                          <p className="text-[13px] text-white/40">{error}</p>
                          <button
                            onClick={fetchLinks}
                            className="mt-4 text-[12px] font-bold text-accent hover:underline"
                          >
                            Try Again
                          </button>
                        </div>
                      ) : (
                        <>
                          {directLinks.length > 0 && (
                            <div>
                              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-white/30">
                                Available Links
                              </h3>
                              <div className="space-y-2">
                                {directLinks.map((res, i) => {
                                  const stream = res.stream;
                                  if (stream.type === 'file') {
                                    return Object.entries(stream.qualities).map(
                                      ([quality, file]) => (
                                        <a
                                          key={`${res.sourceId}-${quality}`}
                                          href={file?.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-4 transition-all hover:border-white/20 hover:bg-black/55"
                                        >
                                          <div>
                                            <p className="text-[14px] font-bold uppercase text-white">
                                              {res.sourceId}
                                            </p>
                                            <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                                              {quality} Quality • MP4
                                            </p>
                                          </div>
                                          <div className="bg-accent/10 flex h-10 w-10 items-center justify-center rounded-full text-accent transition-all group-hover:bg-accent group-hover:text-white">
                                            <svg
                                              width="18"
                                              height="18"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2.5"
                                            >
                                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                            </svg>
                                          </div>
                                        </a>
                                      ),
                                    );
                                  }
                                  if (stream.type === 'hls') {
                                    return (
                                      <a
                                        key={res.sourceId}
                                        href={stream.playlist}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-4 transition-all hover:border-white/20 hover:bg-black/55"
                                      >
                                        <div>
                                          <p className="text-[14px] font-bold uppercase text-white">
                                            {res.sourceId}
                                          </p>
                                          <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                                            HLS Playlist • Multi-Quality
                                          </p>
                                        </div>
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/40 transition-all group-hover:bg-white/10 group-hover:text-white">
                                          <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.5"
                                          >
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                          </svg>
                                        </div>
                                      </a>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
