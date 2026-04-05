'use client';

import { scrapeAllSources } from '@/lib/providers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import type { MediaType, SourceResult } from '@/types';
import { useEffect, useMemo, useState } from 'react';

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

  const { febboxApiKey, customAccentHex, accentColor } = useSettingsStore((s) => s.settings);
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

  if (!isOpen) return null;

  const currentSeasonData = seasons.find(s => s.seasonNumber === season);
  const directLinks = results.filter(r => r.stream.type === 'file' || r.stream.type === 'hls');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#050608]/95 p-6 animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.75)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[20px] font-bold text-white tracking-tight">Media Downloader</h2>
            <p className="text-[13px] text-white/40">{title}</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/5 p-2 text-white/40 hover:bg-white/10 hover:text-white transition-all">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {mediaType === 'show' && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-[11px] font-bold text-white/30 uppercase tracking-widest mb-2">Season</label>
              <select
                value={season}
                onChange={e => { setSeason(Number(e.target.value)); setEpisode(1); }}
                className="input w-full bg-white/5 border-white/10"
              >
                {seasons.map(s => (
                  <option key={s.seasonNumber} value={s.seasonNumber}>Season {s.seasonNumber}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-white/30 uppercase tracking-widest mb-2">Episode</label>
              <select
                value={episode}
                onChange={e => setEpisode(Number(e.target.value))}
                className="input w-full bg-white/5 border-white/10"
              >
                {Array.from({ length: currentSeasonData?.episodeCount || 1 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>Episode {i + 1}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="mt-4 text-[13px] text-white/40">Searching all providers...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
              <p className="text-[13px] text-white/40">{error}</p>
              <button onClick={fetchLinks} className="mt-4 text-[12px] font-bold text-accent hover:underline">Try Again</button>
            </div>
          ) : (
            <>
              {/* Direct Streams */}
              {directLinks.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-3">Available Links</h3>
                  <div className="space-y-2">
                    {directLinks.map((res, i) => {
                      const stream = res.stream;
                      if (stream.type === 'file') {
                        return Object.entries(stream.qualities).map(([quality, file]) => (
                          <a
                            key={`${res.sourceId}-${quality}`}
                            href={file?.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/10 hover:bg-black/55 hover:border-white/20 transition-all group"
                          >
                            <div>
                              <p className="text-[14px] font-bold text-white uppercase">{res.sourceId}</p>
                              <p className="text-[11px] text-white/40 font-medium uppercase tracking-wider">{quality} Quality • MP4</p>
                            </div>
                            <div className="h-10 w-10 flex items-center justify-center rounded-full bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white transition-all">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                            </div>
                          </a>
                        ));
                      }
                      if (stream.type === 'hls') {
                        return (
                          <a
                            key={res.sourceId}
                            href={stream.playlist}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/10 hover:bg-black/55 hover:border-white/20 transition-all group"
                          >
                            <div>
                              <p className="text-[14px] font-bold text-white uppercase">{res.sourceId}</p>
                              <p className="text-[11px] text-white/40 font-medium uppercase tracking-wider">HLS Playlist • Multi-Quality</p>
                            </div>
                            <div className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white transition-all">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
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
  );
}
