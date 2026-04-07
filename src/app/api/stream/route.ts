/* ============================================
   Stream Resolution API Route
   Resolves TMDB title → Multi-provider URLs
   ============================================ */

import { getFebBoxToken, resolveStream } from '@/lib/showbox';
import { getMovieDetails, getShowDetails } from '@/lib/tmdb';
import { NextRequest, NextResponse } from 'next/server';

// Import providers
import { VixSrcProvider } from '@/lib/providers/vixsrc';

// Edge runtime is required for Cloudflare Pages
export const runtime = 'edge';

function normalizeType(rawType: string | null, season?: number, episode?: number): 'movie' | 'show' | null {
  const value = String(rawType || '').trim().toLowerCase();
  if (value === 'movie' || value === 'film') return 'movie';
  if (value === 'show' || value === 'tv' || value === 'series' || value === 'serial') return 'show';
  if (typeof season === 'number' || typeof episode === 'number') return 'show';
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!, 10) : undefined;
  const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!, 10) : undefined;
  const sourceId = String(searchParams.get('source') || 'febbox').trim().toLowerCase();

  const tmdbId = searchParams.get('tmdbId') || searchParams.get('id') || searchParams.get('tmdb') || '';
  const type = normalizeType(searchParams.get('type') || searchParams.get('mediaType'), season, episode);

  let title = (searchParams.get('title') || searchParams.get('name') || searchParams.get('q') || '').trim();
  const year = parseInt(searchParams.get('year') || '0', 10);

  if (!tmdbId || !type) {
    return NextResponse.json({ error: 'Missing tmdbId or type' }, { status: 400 });
  }

  try {
    // If title is missing, fetch it from TMDB
    if (!title) {
        if (type === 'movie') {
            const movie = await getMovieDetails(tmdbId);
            title = movie?.title || '';
        } else {
            const show = await getShowDetails(tmdbId);
            title = show?.title || '';
        }
    }

    // Handle integrated providers from core-main
    if (['vixsrc'].includes(sourceId)) {
        console.log(`[API /stream] Handling provider source: ${sourceId}`);
        let provider: any;
        switch (sourceId) {
            case 'vixsrc': provider = new VixSrcProvider(); break;
        }

        const media = {
            type: type === 'show' ? 'show' as const : 'movie' as const,
            tmdbId,
            title,
            releaseYear: year || 2024,
            s: season,
            e: episode
        };

        try {
            const result = type === 'movie' 
                ? await provider.getMovieSources(media)
                : await provider.getTVSources(media);

            console.log(`[API /stream] Provider ${sourceId} returned ${result.sources.length} sources`);

            if (result.sources.length > 0) {
                // Map the first provider source to our Stream format
                const first = result.sources[0];
                
                // For HLS
                if (first.type === 'hls') {
                    return NextResponse.json({
                        success: true,
                        data: {
                            type: 'hls',
                            url: first.url,
                            playlist: first.url,
                            captions: result.subtitles,
                            headers: first.headers
                        }
                    });
                }
                
                // For File (mp4/mkv)
                const qualities: any = {};
                result.sources.forEach((s: any) => {
                    qualities[s.quality || '1080p'] = { 
                        url: s.url,
                        headers: s.headers
                    };
                });

                return NextResponse.json({
                    success: true,
                    data: {
                        type: 'file',
                        qualities,
                        captions: result.subtitles,
                        audioTracks: first.audioTracks,
                        headers: first.headers // Fallback for some player logic
                    }
                });
            }
        } catch (provErr) {
            console.error(`[API /stream] Provider ${sourceId} threw:`, provErr);
        }

        return NextResponse.json({ success: false, error: 'No sources found from provider' });
    }

    // Default: FebBox resolution
    const queryToken = searchParams.get('febboxToken') || '';
    const headerCookie = request.headers.get('x-febbox-cookie') || '';
    const uiCookie = (queryToken || headerCookie || process.env.FEBBOX_UI_COOKIE || '').trim().replace(/^["']|["']$/g, '');

    const febboxResult = await resolveStream({
      title,
      tmdbId,
      type,
      season,
      episode,
      uiCookie: uiCookie || undefined,
    });

    if (!febboxResult.stream || febboxResult.stream.qualities.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No streams found',
        logs: febboxResult.logs,
      });
    }

    return NextResponse.json({
      success: true,
      data: febboxResult.stream,
      logs: febboxResult.logs,
    });
  } catch (error: any) {
    console.error('Stream resolution error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === 'validate-febbox') {
      const clientId = process.env.FEBBOX_CLIENT_ID || body.clientId || '';
      const clientSecret = process.env.FEBBOX_CLIENT_SECRET || body.clientSecret || '';
      if (!clientId || !clientSecret) {
        return NextResponse.json({ valid: false, error: 'Missing FebBox credentials' });
      }
      const tokenRes = await getFebBoxToken(clientId, clientSecret);
      if (tokenRes.code === 1 && tokenRes.data?.access_token) {
        return NextResponse.json({
          valid: true,
          expiresIn: tokenRes.data.expires_in,
          tokenType: tokenRes.data.token_type,
        });
      }
      return NextResponse.json({ valid: false, error: tokenRes.msg });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
