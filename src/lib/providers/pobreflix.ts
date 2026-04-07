import type { ProviderCapabilities, ProviderMediaObject, ProviderResult, Source } from './base';
import { BaseProvider } from './base';

const BASE_URL = 'https://pobreflix.codes';
const XPASS_BASE = 'https://play.xpass.top';

const DEFAULT_HEADERS = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    accept: 'application/json, */*',
    referer: `${XPASS_BASE}/`,
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};

export class PobreflixProvider extends BaseProvider {
    readonly id = 'pobreflix';
    readonly name = 'Pobreflix';
    readonly enabled = true;
    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    private buildXpassPlaylistUrls(tmdbId: string, type: 'movie' | 'tv', season?: number, episode?: number): string[] {
        if (type === 'movie') {
            return [
                `${XPASS_BASE}/mov/${tmdbId}/0/0/0/playlist.json`,
                `${XPASS_BASE}/vrk/movie/${tmdbId}/playlist.json`,
                `${XPASS_BASE}/vsr/movie/${tmdbId}/playlist.json`,
                `${XPASS_BASE}/meg/movie/${tmdbId}/0/0/playlist.json`,
                `${XPASS_BASE}/vxr/movie/${tmdbId}/playlist.json`
            ];
        }
        const s = season ?? 1;
        const e = episode ?? 1;
        return [
            `${XPASS_BASE}/mov/${tmdbId}/${s}/${e}/0/playlist.json`,
            `${XPASS_BASE}/vrk/tv/${tmdbId}/${s}/${e}/playlist.json`,
            `${XPASS_BASE}/vsr/tv/${tmdbId}/${s}/${e}/playlist.json`,
            `${XPASS_BASE}/meg/tv/${tmdbId}/${s}/${e}/playlist.json`,
            `${XPASS_BASE}/vxr/tv/${tmdbId}/${s}/${e}/playlist.json`
        ];
    }

    private async resolveViaXpass(tmdbId: string, type: 'movie' | 'tv', season?: number, episode?: number): Promise<string | null> {
        const urls = this.buildXpassPlaylistUrls(tmdbId, type, season, episode);

        for (const url of urls) {
            try {
                console.log(`[Pobreflix] Probing ${url}`);
                const response = await fetch(url, {
                    headers: DEFAULT_HEADERS,
                    signal: AbortSignal.timeout(10000)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const file = data?.playlist?.[0]?.sources?.[0]?.file;
                    if (file) {
                        console.log(`[Pobreflix] Found stream at ${url}: ${file}`);
                        return file;
                    }
                }
            } catch (err) {
                // Ignore and continue probing
            }
        }
        return null;
    }

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        const streamUrl = await this.resolveViaXpass(media.tmdbId, 'movie');
        return this.formatResult(streamUrl, media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        const streamUrl = await this.resolveViaXpass(media.tmdbId, 'tv', media.s, media.e);
        return this.formatResult(streamUrl, media);
    }

    private formatResult(streamUrl: string | null, media: ProviderMediaObject): ProviderResult {
        if (!streamUrl) {
            return {
                sources: [],
                subtitles: [],
                diagnostics: [{
                    code: 'PROVIDER_NOT_FOUND',
                    message: 'Pobreflix/XPASS returned no playable playlist',
                    field: '',
                    severity: 'error'
                }]
            };
        }

        const sources: Source[] = [
            {
                url: streamUrl,
                type: 'hls',
                quality: 'auto',
                headers: {
                    ...DEFAULT_HEADERS,
                    Referer: `${XPASS_BASE}/`
                },
                audioTracks: [
                    { language: 'pt', label: 'Portuguese' },
                    { language: 'en', label: 'English' }
                ],
                provider: {
                    id: this.id,
                    name: this.name
                }
            }
        ];

        return {
            sources,
            subtitles: [],
            diagnostics: []
        };
    }
}
