/* ============================================
   Stream Resolution API Route
   Resolves TMDB title → Multi-provider URLs
   ============================================ */

import { createGenericErrorResponse, createValidationErrorResponse } from '@/lib/api-error';
import { validateStreamParams } from '@/lib/api-validation';
import { isValidCloudSession } from '@/lib/auth-server';
import { isRequestFromAllowedSite } from '@/lib/request-verification';
import { getFebBoxToken, resolveStream } from '@/lib/showbox';
import { getMovieDetails, getShowDetails } from '@/lib/tmdb';
import { NextRequest, NextResponse } from 'next/server';

// Import providers
import { PobreflixProvider } from '@/lib/providers/pobreflix';

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
  try {
    // Block requests not originating from nexvid.online in production.
    if (!isRequestFromAllowedSite(request)) {
      return NextResponse.json(
        { error: 'Forbidden origin' },
        { status: 403 }
      );
    }

    // 1. Input validation (do this first to get sourceId)
    const validation = validateStreamParams(new URL(request.url).searchParams);
    if (!validation.valid) {
      return createValidationErrorResponse(validation.errors);
    }

    const { sourceId } = validation.data!;

    // 2. Auth Check & Token Extraction
    const authHeader = request.headers.get('Authorization');
    const cookieHeader = request.headers.get('cookie') || '';
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : cookieHeader.match(/nexvid_session=([^;]+)/)?.[1];

    if (!token || !(await isValidCloudSession(request))) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Stream resolution requires an active NexVid session' },
        { status: 401 }
      );
    }

    // 3. FebBox-based sources require explicit user token
    if (sourceId === 'alpha' || sourceId === 'febbox') {
      const febboxToken = request.headers.get('x-febbox-cookie') ||
                         request.nextUrl.searchParams.get('febboxToken') || '';

      if (!febboxToken || febboxToken.trim() === '') {
        return NextResponse.json(
          {
            error: 'Premium source requires FebBox token',
            details: 'Set X-FebBox-Cookie header or febboxToken parameter'
          },
          { status: 403 }
        );
      }
    }

    const { tmdbId, type, season, episode, title: inputTitle, year } = validation.data!;

    let title = inputTitle || '';

    // If title is missing, fetch it from TMDB
    if (!title) {
      try {
        if (type === 'movie') {
          const movie = await getMovieDetails(tmdbId);
          title = movie?.title || '';
        } else {
          const show = await getShowDetails(tmdbId);
          title = show?.title || '';
        }
      } catch (tmdbError) {
        console.error('[API /stream] TMDB fetch failed:', tmdbError);
        return createGenericErrorResponse(tmdbError, 502, '/stream');
      }
    }

    // Map beta/alpha to their actual sources
    let actualSourceId = sourceId;
    if (sourceId === 'beta') {
      actualSourceId = 'pobreflix';
    } else if (sourceId === 'alpha') {
      actualSourceId = 'febbox';
    }

    // Handle Pobreflix (including beta)
    if (actualSourceId === 'pobreflix') {
      console.log(`[API /stream] Handling provider source: ${actualSourceId} (requested: ${sourceId})`);
      const provider = new PobreflixProvider();

      const media = {
        type: type === 'show' ? ('show' as const) : ('movie' as const),
        tmdbId,
        title,
        releaseYear: year || 2024,
        s: season,
        e: episode,
      };

      try {
        const result =
          type === 'movie'
            ? await provider.getMovieSources(media)
            : await provider.getTVSources(media);

        console.log(`[API /stream] Provider ${actualSourceId} returned ${result.sources.length} sources`);

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
                headers: first.headers,
              },
            });
          }

          // For File (mp4/mkv)
          const qualities: any = {};
          result.sources.forEach((s: any) => {
            qualities[s.quality || '1080p'] = {
              url: s.url,
              headers: s.headers,
            };
          });

          return NextResponse.json({
            success: true,
            data: {
              type: 'file',
              qualities,
              captions: result.subtitles,
              audioTracks: first.audioTracks,
              headers: first.headers, // Fallback for some player logic
            },
          });
        }
      } catch (provErr) {
        console.error(`[API /stream] Provider ${actualSourceId} error:`, provErr);
        return createGenericErrorResponse(provErr, 502, '/stream');
      }

      return NextResponse.json(
        { error: 'No streams found' },
        { status: 404 }
      );
    }

    // Handle alpha (Premium FebBox with user's token)
    if (sourceId === 'alpha') {
      const queryToken = request.nextUrl.searchParams.get('febboxToken') || '';
      const headerCookie = request.headers.get('x-febbox-cookie') || '';
      const uiCookie = (queryToken || headerCookie || '')
        .trim()
        .replace(/^["']|["']$/g, '');

      const febboxResult = await resolveStream({
        title,
        tmdbId,
        type,
        season,
        episode,
        uiCookie: uiCookie || undefined,
      });

      if (!febboxResult.stream || febboxResult.stream.qualities.length === 0) {
        return NextResponse.json(
          { error: 'No streams found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: febboxResult.stream,
      });
    }

    // Default: FebBox resolution
    const queryToken = request.nextUrl.searchParams.get('febboxToken') || '';
    const headerCookie = request.headers.get('x-febbox-cookie') || '';
    const uiCookie = (queryToken || headerCookie || '')
      .trim()
      .replace(/^["']|["']$/g, '');

    const febboxResult = await resolveStream({
      title,
      tmdbId,
      type,
      season,
      episode,
      uiCookie: uiCookie || undefined,
    });

    if (!febboxResult.stream || febboxResult.stream.qualities.length === 0) {
      return NextResponse.json(
        { error: 'No streams found' },
        { status: 404 }
      );
    }

    // Return stream data WITHOUT internal logs
    return NextResponse.json({
      success: true,
      data: febboxResult.stream,
    });
  } catch (error: any) {
    return createGenericErrorResponse(error, 500, '/stream');
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isRequestFromAllowedSite(request)) {
      return NextResponse.json(
        { error: 'Forbidden origin' },
        { status: 403 }
      );
    }

    // Authentication check
    const isAuthenticated = await isValidCloudSession(request);
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    if (body.action === 'validate-febbox') {
      const clientId = process.env.FEBBOX_CLIENT_ID || body.clientId || '';
      const clientSecret = process.env.FEBBOX_CLIENT_SECRET || body.clientSecret || '';
      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: 'Invalid request' },
          { status: 400 }
        );
      }
      const tokenRes = await getFebBoxToken(clientId, clientSecret);
      if (tokenRes.code === 1 && tokenRes.data?.access_token) {
        return NextResponse.json({
          valid: true,
          expiresIn: tokenRes.data.expires_in,
          tokenType: tokenRes.data.token_type,
        });
      }
      return NextResponse.json(
        { error: 'Validation failed' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  } catch (error: any) {
    return createGenericErrorResponse(error, 500, '/stream POST');
  }
}
