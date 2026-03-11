/* ============================================
   Source Provider Integration
  FebBox source integration (direct mp4)
  + embed fallback providers
   ============================================ */

import type {
  AudioTrack,
  EmbedStream,
  FileBasedStream,
  HlsBasedStream,
  MediaType,
  ScrapeProgress,
  SourceMeta,
  SourceResult,
  StreamFile,
  StreamQuality,
} from '@/types';

interface ProviderConfig {
  proxyUrl?: string;
}

let config: ProviderConfig = {};

export function configureProviders(newConfig: ProviderConfig) {
  config = { ...config, ...newConfig };
}

export const SOURCES: SourceMeta[] = [
  { id: 'febbox', name: 'FebBox', rank: 300, type: 'source' },
  { id: 'videasy', name: 'Videasy', rank: 250, type: 'embed' },
  { id: 'vidlink', name: 'VidLink Pro', rank: 200, type: 'embed' },
];

const SOURCE_LABELS: Record<string, string> = {
  febbox: 'FebBox',
  videasy: 'Videasy',
  vidlink: 'VidLink Pro',
};

function mapQuality(raw: string): StreamQuality {
  const q = raw.toLowerCase();
  if (q.includes('4k') || q.includes('2160')) return '4k';
  if (q.includes('1080')) return '1080';
  if (q.includes('720')) return '720';
  if (q.includes('480')) return '480';
  if (q.includes('360')) return '360';
  return 'unknown';
}

export interface ScrapeOptions {
  tmdbId: string;
  imdbId?: string;
  title: string;
  releaseYear: number;
  mediaType: MediaType;
  season?: number;
  episode?: number;
  febboxCookie?: string;
  sessionToken?: string | null;
  accentColor?: string;
  idlePauseOverlay?: boolean;
  episodeTmdbId?: string;
  seasonTmdbId?: string;
  seasonTitle?: string;
  episodeCount?: number;
  onProgress?: (progress: ScrapeProgress) => void;
  onSourceFound?: (result: SourceResult) => void;
  onDebugLog?: (entry: { step: string; source?: string; message: string; data?: any }) => void;
}

function pushDebug(
  options: ScrapeOptions,
  entry: { step: string; source?: string; message: string; data?: any },
) {
  options.onDebugLog?.(entry);
}

async function scrapeSource(options: ScrapeOptions, sourceId: string): Promise<SourceResult | null> {
  try {
    const sourceLabel = SOURCE_LABELS[sourceId] || sourceId;
    pushDebug(options, { step: sourceId, message: `Starting ${sourceLabel} resolution` });

    if (sourceId === 'videasy') {
      options.onProgress?.({ id: sourceId, percentage: 50, status: 'pending' });
      const baseUrl = 'https://player.videasy.net';
      let embedUrl = '';
      if (options.mediaType === 'movie') {
        embedUrl = `${baseUrl}/movie/${options.tmdbId}`;
      } else {
        embedUrl = `${baseUrl}/tv/${options.tmdbId}/${options.season || 1}/${options.episode || 1}`;
      }

      const url = new URL(embedUrl);
      const color = (options.accentColor || '6366f1').replace('#', '');
      url.searchParams.set('color', color);
      url.searchParams.set('nextEpisode', 'true');
      url.searchParams.set('autoplayNextEpisode', 'true');
      url.searchParams.set('episodeSelector', 'true');
      if (options.idlePauseOverlay) url.searchParams.set('overlay', 'true');

      const stream: EmbedStream = { type: 'embed', url: url.toString() };
      options.onProgress?.({ id: sourceId, percentage: 100, status: 'success' });
      return { sourceId, stream };
    }

    if (sourceId === 'vidlink') {
      options.onProgress?.({ id: sourceId, percentage: 50, status: 'pending' });
      const baseUrl = 'https://vidlink.pro';
      let embedUrl = '';
      if (options.mediaType === 'movie') {
        embedUrl = `${baseUrl}/movie/${options.tmdbId}`;
      } else {
        embedUrl = `${baseUrl}/tv/${options.tmdbId}/${options.season || 1}/${options.episode || 1}`;
      }

      const url = new URL(embedUrl);
      const color = (options.accentColor || '6366f1').replace('#', '');
      url.searchParams.set('primaryColor', color);
      url.searchParams.set('nextbutton', 'true');
      url.searchParams.set('autoplay', 'true');

      const stream: EmbedStream = { type: 'embed', url: url.toString() };
      options.onProgress?.({ id: sourceId, percentage: 100, status: 'success' });
      return { sourceId, stream };
    }

    const params = new URLSearchParams({
      tmdbId: options.tmdbId,
      mediaType: options.mediaType,
      title: options.title,
      year: String(options.releaseYear),
    });

    if (options.mediaType === 'show') {
      params.set('season', String(options.season || 1));
      params.set('episode', String(options.episode || 1));
    }

    if (options.febboxCookie) params.set('febboxToken', options.febboxCookie);

    params.set('source', sourceId);
    options.onProgress?.({ id: sourceId, percentage: 30, status: 'pending' });

    const response = await fetch(`/api/stream?${params.toString()}`, {
      headers: {
        ...(options.febboxCookie ? { 'x-febbox-cookie': options.febboxCookie } : {}),
        ...(options.sessionToken ? { 'Authorization': `Bearer ${options.sessionToken}` } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();

    options.onProgress?.({ id: sourceId, percentage: 80, status: 'pending' });

    const captions = Array.isArray(data.data?.subtitles)
      ? data.data.subtitles
        .map((subtitle: any) => {
          const url = String(subtitle?.url || '');
          if (!url) return null;
          const language = String(subtitle?.language || 'en').toLowerCase();
          const label = String(subtitle?.label || language.toUpperCase());
          const type = String(subtitle?.type || '').toLowerCase().includes('vtt') ? 'vtt' : 'srt';
          return { id: `sb-${language}-${label}`, language, label, type, url };
        })
        .filter(Boolean)
      : [];

    if (data.success && String(data.data?.kind || '').toLowerCase() === 'hls') {
      const streamUrl = String(data.data?.url || '').trim();
      if (!streamUrl) {
        options.onProgress?.({ id: sourceId, percentage: 100, status: 'notfound' });
        return null;
      }
      const stream: HlsBasedStream = {
        type: 'hls',
        id: `${sourceId}-hls-stream`,
        flags: [],
        captions,
        playlist: streamUrl,
        headers: data.data?.headers && typeof data.data.headers === 'object' ? data.data.headers : undefined,
      };
      options.onProgress?.({ id: sourceId, percentage: 100, status: 'success' });
      return { sourceId, stream };
    }

    if (data.success && data.data?.qualities && typeof data.data.qualities === 'object') {
      const qualities: Partial<Record<StreamQuality, StreamFile>> = {};
      const qualityList = Array.isArray(data.data.qualities) ? data.data.qualities : Object.values(data.data.qualities);
      
      for (const q of qualityList as any[]) {
        const mapped = mapQuality(q.quality || q.label || '');
        qualities[mapped] = { type: 'mp4', url: q.url };
      }

      const stream: FileBasedStream = {
        type: 'file',
        id: `${sourceId}-stream`,
        flags: [],
        captions,
        audioTracks: Array.isArray(data.data.audioTracks)
          ? data.data.audioTracks.map((track: any, index: number) => ({
            id: index,
            name: String(track?.name || track?.label || `Track ${index + 1}`),
            lang: String(track?.lang || 'unknown').toLowerCase(),
            isDefault: Boolean(track?.isDefault || index === 0),
            url: track?.url,
          }))
          : [],
        qualities,
      };
      options.onProgress?.({ id: sourceId, percentage: 100, status: 'success' });
      return { sourceId, stream };
    }

    options.onProgress?.({ id: sourceId, percentage: 100, status: 'notfound' });
    return null;
  } catch (error: any) {
    options.onProgress?.({ id: sourceId, percentage: 100, status: 'failure' });
    return null;
  }
}

export async function scrapeAllSources(options: ScrapeOptions): Promise<SourceResult[]> {
  const results: SourceResult[] = [];

  for (const source of SOURCES) {
    const result = await scrapeSource(options, source.id);
    if (result) {
      results.push(result);
      options.onSourceFound?.(result);
    }
  }

  return results;
}

export function getAvailableSources(): SourceMeta[] {
  return [...SOURCES];
}
