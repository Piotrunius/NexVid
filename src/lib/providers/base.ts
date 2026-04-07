export type MediaType = 'movie' | 'show';

export interface ProviderMediaObject {
    type: MediaType;
    tmdbId: string;
    imdbId?: string;
    title: string;
    releaseYear: number;
    s?: number;
    e?: number;
}

export type SourceType = 'hls' | 'mp4' | 'mkv' | 'embed';

export interface Source {
    url: string;
    type: SourceType;
    quality?: string;
    headers?: Record<string, string>;
    audioTracks?: {
        label: string;
        language: string;
    }[];
    provider: {
        id: string;
        name: string;
    };
}

export interface Subtitle {
    url: string;
    label: string;
    format: 'srt' | 'vtt';
}

export interface Diagnostic {
    code: string;
    message: string;
    field: string;
    severity: 'info' | 'warning' | 'error';
}

export interface ProviderResult {
    sources: Source[];
    subtitles: Subtitle[];
    diagnostics: Diagnostic[];
}

export interface ProviderCapabilities {
    supportedContentTypes: ('movies' | 'tv')[];
}

export abstract class BaseProvider {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly enabled: boolean;
    abstract readonly capabilities: ProviderCapabilities;

    protected console = {
        log: (...args: any[]) => console.log(`[${this.name}]`, ...args),
        error: (...args: any[]) => console.error(`[${this.name}]`, ...args),
        warn: (...args: any[]) => console.warn(`[${this.name}]`, ...args),
    };

    abstract getMovieSources(media: ProviderMediaObject): Promise<ProviderResult>;
    abstract getTVSources(media: ProviderMediaObject): Promise<ProviderResult>;

    protected createProxyUrl(url: string, headers?: Record<string, string>): string {
        // In our app, we use /api/hls-proxy or similar if needed.
        // For now, return the URL as is, or wrap it in a proxy if the provider needs it.
        // The VideoPlayer component handles hls-proxy for HLS streams.
        return url;
    }

    // Edge-compatible fetch helpers
    protected async fetchPage(url: string, headers?: Record<string, string>): Promise<string | null> {
        try {
            const res = await fetch(url, {
                headers: headers || {},
                signal: AbortSignal.timeout(10000)
            });
            if (!res.ok) return null;
            return await res.text();
        } catch (error) {
            return null;
        }
    }

    protected async fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
        try {
            const res = await fetch(url, {
                headers: headers || {},
                signal: AbortSignal.timeout(10000)
            });
            if (!res.ok) return null;
            return await res.json() as T;
        } catch (error) {
            return null;
        }
    }
}
