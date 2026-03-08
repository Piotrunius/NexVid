/* ============================================
   Source Provider Integration
  FebBox source integration (direct mp4)
  + embed fallback providers
   ============================================ */

import type {
    AudioTrack,
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

const SOURCES: SourceMeta[] = [
  { id: 'febbox', name: 'FebBox', rank: 300, type: 'source' },
];

const SOURCE_LABELS: Record<string, string> = {
  febbox: 'FebBox',
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
    options.onProgress?.({ id: sourceId, percentage: 10, status: 'pending' });

    const params = new URLSearchParams({
      title: options.title,
      tmdbId: options.tmdbId,
      type: options.mediaType === 'movie' ? 'movie' : 'show',
    });

    if (options.mediaType !== 'movie') {
      if (options.season) params.set('season', String(options.season));
      if (options.episode) params.set('episode', String(options.episode));
    }

    params.set('source', sourceId);

    options.onProgress?.({ id: sourceId, percentage: 30, status: 'pending' });

    const response = await fetch(`/api/stream?${params.toString()}`, {
      headers: {
        ...(options.febboxCookie ? { 'x-febbox-cookie': options.febboxCookie } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();

    pushDebug(options, {
      step: sourceId,
      message: `API response: success=${Boolean(data.success)}`,
      data: data?.logs || data?.error,
    });
    pushDebug(options, {
      step: sourceId,
      message: `Using user-provided UI cookie: ${Boolean(options.febboxCookie)}`,
      data: data?.diagnostics,
    });

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
        pushDebug(options, { step: sourceId, message: `${sourceLabel} returned hls kind without playlist URL` });
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
      pushDebug(options, { step: 'done', source: sourceId, message: `Using ${sourceLabel} hls stream` });
      return { sourceId, stream };
    }

    if (data.success && data.data?.qualities?.length > 0) {
      const qualities: Partial<Record<StreamQuality, StreamFile>> = {};
      for (const q of data.data.qualities) {
        const mapped = mapQuality(q.quality);
        qualities[mapped] = { type: 'mp4', url: q.url };
      }

      const stream: FileBasedStream = {
        type: 'file',
        id: `${sourceId}-stream`,
        flags: [],
        captions,
        audioTracks: Array.isArray(data.data.audioTracks)
          ? data.data.audioTracks.map((track: any, index: number) => ({
            id: Number.isFinite(Number(track?.id)) ? Number(track.id) : index,
            name: String(track?.name || track?.label || track?.lang || `Track ${index + 1}`),
            lang: String(track?.lang || track?.language || 'unknown').toLowerCase(),
            isDefault: Boolean(track?.isDefault || track?.default || index === 0),
            url: track?.url ? String(track.url) : undefined,
          } as AudioTrack))
          : [],
        qualities,
      };

      options.onProgress?.({ id: sourceId, percentage: 100, status: 'success' });
      pushDebug(options, { step: 'done', source: sourceId, message: `Using ${sourceLabel} direct stream` });
      return { sourceId, stream };
    }

    options.onProgress?.({ id: sourceId, percentage: 100, status: 'notfound' });
    pushDebug(options, { step: sourceId, message: 'No direct stream found' });
    return null;
  } catch (error: any) {
    options.onProgress?.({ id: sourceId, percentage: 100, status: 'failure' });
    pushDebug(options, { step: sourceId, message: 'Failed with exception', data: error?.message });
    return null;
  }
}

export async function scrapeAllSources(options: ScrapeOptions): Promise<SourceResult[]> {
  const results: SourceResult[] = [];

  pushDebug(options, {
    step: 'start',
    message: `Scrape started for ${options.mediaType} ${options.tmdbId}`,
    data: {
      title: options.title,
      season: options.season,
      episode: options.episode,
    },
  });

  for (const source of SOURCES) {
    const result = await scrapeSource(options, source.id);
    if (result) {
      results.push(result);
      options.onSourceFound?.(result);
      continue;
    }

    pushDebug(options, {
      step: 'done',
      source: source.id,
      message: `No direct stream found from ${source.name}`,
    });
  }

  if (results.length > 0) {
    pushDebug(options, {
      step: 'done',
      message: `Scrape complete: ${results.length} source(s) found`,
      data: results.map(r => r.sourceId),
    });
  }

  return results;
}

export function getAvailableSources(): SourceMeta[] {
  return [...SOURCES];
}
