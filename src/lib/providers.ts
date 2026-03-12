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
  { id: 'vixsrc', name: 'VixSrc', rank: 275, type: 'source' },
  { id: 'videasy', name: 'Videasy', rank: 250, type: 'embed' },
  { id: 'vidlink', name: 'VidLink Pro', rank: 200, type: 'embed' },
];

const SOURCE_LABELS: Record<string, string> = {
  febbox: 'FebBox',
  vixsrc: 'VixSrc',
  videasy: 'Videasy',
  vidlink: 'VidLink Pro',
};

export function mapQuality(raw: string): StreamQuality {
  const q = String(raw || '').toLowerCase();
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

    // Videasy is a simple embed, can stay on client
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

    // Vidlink is also a simple embed
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
      
      const accentMap: Record<string, string> = {
        indigo: '6366f1',
        violet: '8b5cf6',
        rose: 'f43f5e',
        emerald: '10b981',
        amber: 'f59e0b',
        cyan: '06b6d4'
      };

      let color = '6366f1';
      if (options.accentColor && /^[0-9a-fA-F]{3,6}$/.test(options.accentColor)) {
        color = options.accentColor;
      } else if (options.accentColor && accentMap[options.accentColor]) {
        color = accentMap[options.accentColor];
      }

      url.searchParams.set('primaryColor', color);
      url.searchParams.set('secondaryColor', '000000');
      url.searchParams.set('nextbutton', 'true');
      url.searchParams.set('autoplay', 'true');

      const stream: EmbedStream = { type: 'embed', url: url.toString() };
      options.onProgress?.({ id: sourceId, percentage: 100, status: 'success' });
      return { sourceId, stream };
    }

    // Integrated providers
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
      signal: AbortSignal.timeout(25000),
    });
    
    if (!response.ok) {
        options.onProgress?.({ id: sourceId, percentage: 100, status: 'notfound' });
        return null;
    }
    
    const data = await response.json();
    options.onProgress?.({ id: sourceId, percentage: 80, status: 'pending' });

    if (!data.success || !data.data) {
        options.onProgress?.({ id: sourceId, percentage: 100, status: 'notfound' });
        return null;
    }

    const streamData = data.data;
    const captions = Array.isArray(streamData.captions || streamData.subtitles)
      ? (streamData.captions || streamData.subtitles)
        .map((subtitle: any) => {
          const url = String(subtitle?.url || '');
          if (!url) return null;
          const language = String(subtitle?.language || subtitle?.label || 'en').toLowerCase();
          const label = String(subtitle?.label || language.toUpperCase());
          const type = String(subtitle?.type || subtitle?.format || '').toLowerCase().includes('vtt') ? 'vtt' : 'srt';
          return { id: `sb-${language}-${label}-${Math.random().toString(36).slice(2, 6)}`, language, label, type, url };
        })
        .filter(Boolean)
      : [];

    if (String(streamData.type || streamData.kind || '').toLowerCase() === 'hls' || streamData.playlist) {
      const streamUrl = String(streamData.playlist || streamData.url || '').trim();
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
        headers: streamData.headers,
      };
      options.onProgress?.({ id: sourceId, percentage: 100, status: 'success' });
      return { sourceId, stream };
    }

    if (streamData.qualities && typeof streamData.qualities === 'object') {
      const qualities: Partial<Record<StreamQuality, StreamFile>> = {};
      
      if (Array.isArray(streamData.qualities)) {
          for (const q of streamData.qualities) {
              const mapped = mapQuality(q.quality || q.label || '');
              qualities[mapped] = { type: 'mp4', url: q.url };
          }
      } else {
          for (const [key, val] of Object.entries(streamData.qualities)) {
              const mapped = mapQuality(key);
              qualities[mapped] = { type: 'mp4', url: (val as any).url || val };
          }
      }

      const stream: FileBasedStream = {
        type: 'file',
        id: `${sourceId}-stream`,
        flags: [],
        captions,
        audioTracks: streamData.audioTracks,
        qualities,
      };
      options.onProgress?.({ id: sourceId, percentage: 100, status: 'success' });
      return { sourceId, stream };
    }

    options.onProgress?.({ id: sourceId, percentage: 100, status: 'notfound' });
    return null;
  } catch (error: any) {
    console.error(`[scrapeSource] ${sourceId} error:`, error);
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
    } else if (['febbox', 'vixsrc'].includes(source.id)) {
      // Always include these as placeholders if they fail,
      // so the user can see them in the list even if no results found.
      const placeholder: SourceResult = {
        sourceId: source.id,
        stream: { type: 'file', id: `${source.id}-placeholder`, flags: [], qualities: {} }
      };
      results.push(placeholder);
      options.onSourceFound?.(placeholder);
    }
  }

  return results;
}

export function getAvailableSources(): SourceMeta[] {
  return [...SOURCES];
}
