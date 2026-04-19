import type {
  Diagnostic,
  ProviderCapabilities,
  ProviderMediaObject,
  ProviderResult,
  Source,
  SubtitleFormat,
} from '../base';
import { BaseProvider, type SourceType, type Subtitle } from '../base';
import axios from 'axios';
import { MovieDownloaderResponse, Token } from './02moviedownloader.types';

export class MovieDownloader extends BaseProvider {
  readonly id = '02moviedownloader';
  readonly name = '02MovieDownloader';
  readonly enabled = true;
  readonly BASE_URL = 'https://02moviedownloader.site';

  readonly HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (X11; U; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36',
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.1',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'sec-gpc': '1',
  };

  readonly capabilities: ProviderCapabilities = {
    supportedContentTypes: ['movies', 'tv'],
  };

  /**
   * Fetch movie sources
   */
  async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return this.getSources(media);
  }

  /**
   * Fetch TV episode sources
   */
  async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
    return this.getSources(media);
  }

  async getToken(media: ProviderMediaObject): Promise<string> {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (X11; U; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36',
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.7',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      dnt: '1',
      origin: this.BASE_URL,
      referer:
        this.BASE_URL +
        '/api/download' +
        (media.type === 'movie'
          ? '/movie/' + media.tmdbId
          : '/tv/' + media.tmdbId + media.s + media.e),
      priority: 'u=1, i',
      'sec-ch-ua': '"(Not(A:Brand";v="99", "Google Chrome";v="134", "Chromium";v="134"',
      'sec-ch-ua-full-version-list':
        '"(Not(A:Brand";v="99.0.0.0", "Google Chrome";v="134", "Chromium";v="134"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'sec-gpc': '1',
    };

    const req = await fetch(this.BASE_URL + '/api/verify-robot', {
      method: 'POST',
      headers,
    });

    const resp = (await req.json()) as Token;
    if (resp.token) {
      return resp.token;
    } else {
      throw 'no token found...';
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.head(this.BASE_URL, {
        timeout: 5000,
        headers: this.HEADERS,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Main scraping logic
   */
  private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
    try {
      const pageUrl = this.buildPageUrl(media);
      const token = await this.getToken(media);

      if (!token) {
        return this.emptyResult('Failed to fetch token', media);
      }

      const response: MovieDownloaderResponse = await this.fetchPageContent(pageUrl, token, media);

      // Map to ProviderResult
      return this.mapToProviderResult(response);
    } catch (error) {
      return this.emptyResult(
        error instanceof Error ? error.message : 'Failed to process sources',
        media,
      );
    }
  }

  private mapToProviderResult(data: MovieDownloaderResponse): ProviderResult {
    const sources: Source[] = [];

    // Map download sources
    if (data.data?.downloadData?.data?.downloads) {
      data.data.downloadData.data.downloads.forEach((download) => {
        sources.push({
          url: this.createProxyUrl(
            download.url,
            download.url.includes('hakunaymatata')
              ? {
                  ...this.HEADERS,
                  Referer: 'https://lok-lok.cc/',
                  Origin: 'https://lok-lok.cc/',
                }
              : this.HEADERS,
          ),
          type: 'mp4',
          quality: download.resolution === 0 ? 'unknown' : download.resolution.toString(),
          audioTracks: [
            {
              language: 'eng',
              label: 'English',
            },
          ], // Only has english sources.
          provider: {
            id: this.id,
            name: this.name,
          },
        });
      });
    }

    // Map external streams
    if (data.externalStreams) {
      data.externalStreams.forEach((stream) => {
        const qualityMatch = stream.quality.match(/(\d+)p/i);
        const height = qualityMatch ? parseInt(qualityMatch[1]) : undefined;
        let inferredType: SourceType = 'mp4';
        if (stream.url.includes('.m3u8')) inferredType = 'hls';
        else if (stream.url.includes('.mkv')) inferredType = 'mkv';

        // skip a.111477.xyz as they are behind cloudflare, and do not allow direct access to the video file
        if (stream.url.includes('111477.xyz')) {
          return;
        }

        sources.push({
          url: this.createProxyUrl(stream.url, stream.url.includes('pixeldra') ? {} : this.HEADERS),
          type: inferredType,
          quality: height ? height.toString() : stream.quality.toLowerCase().replace('p', ''),
          audioTracks: [
            {
              language: 'eng',
              label: 'English',
            },
          ], // Only has english sources.
          provider: {
            id: this.id,
            name: this.name,
          },
        });
      });
    }

    // Map subtitles
    const subtitles: Subtitle[] = [];
    if (data.data?.downloadData?.data?.captions) {
      data.data.downloadData.data.captions.forEach((caption) => {
        const format = caption.url.includes('.srt') ? 'srt' : 'vtt';
        subtitles.push({
          url: this.createProxyUrl(caption.url),
          label: caption.lanName || caption.lan,
          format: format as SubtitleFormat,
        });
      });
    }

    const diagnostics: Diagnostic[] = [];

    // Add diagnostic if no sources found
    if (sources.length === 0) {
      diagnostics.push({
        code: 'PROVIDER_ERROR',
        message: `${this.name}: No playable sources found`,
        field: '',
        severity: 'warning',
      });
    }

    // Add quality inference diagnostics
    sources.forEach((source, index) => {
      if (!source.quality || source.quality === '0') {
        diagnostics.push({
          code: 'QUALITY_INFERRED',
          message: `${this.name}: Quality inferred for source ${index + 1}`,
          field: `sources[${index}].quality`,
          severity: 'info',
        });
      }
    });

    return {
      sources,
      subtitles,
      diagnostics,
    };
  }

  private buildPageUrl(media: ProviderMediaObject): string {
    const tmdbId = media.tmdbId;
    if (media.type === 'movie') {
      return `${this.BASE_URL}/api/download/movie/${tmdbId}`;
    }
    return `${this.BASE_URL}/api/download/tv/${tmdbId}/${media.s}/${media.e}`;
  }

  private async fetchPageContent(
    url: string,
    token: string,
    media: ProviderMediaObject,
  ): Promise<any> {
    try {
      const refererUrl =
        this.BASE_URL +
        '/api/download' +
        (media.type === 'movie'
          ? '/movie/' + media.tmdbId
          : '/tv/' + media.tmdbId + media.s + media.e);

      const response = await fetch(url, {
        headers: {
          ...this.HEADERS,
          accept: 'application/json',
          'x-session-token': token,
          origin: this.BASE_URL,
          referer: refererUrl,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to fetch page for ${media.title}: ${error}`);
    }
  }

  /**
   * Return empty result with diagnostic
   */
  private emptyResult(message: string, media: ProviderMediaObject): ProviderResult {
    return {
      sources: [],
      subtitles: [],
      diagnostics: [
        {
          code: 'PROVIDER_ERROR',
          message: `${this.name}: ${message}`,
          field: '',
          severity: 'error',
        },
      ],
    };
  }
}
