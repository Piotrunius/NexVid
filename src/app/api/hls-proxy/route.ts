import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const ALLOWED_HEADER_KEYS = new Set([
  'referer',
  'origin',
  'user-agent',
  'authorization',
  'cookie',
  'accept',
  'accept-language',
  'range',
  'connection',
]);

function parseHeadersJson(raw: string | null): Record<string, string> {
  if (!raw) return {};
  const parsed = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (!ALLOWED_HEADER_KEYS.has(normalized)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    result[normalized] = trimmed;
  }
  return result;
}

function parseForwardHeaders(searchParams: URLSearchParams): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const raw of searchParams.getAll('headers')) {
    const parsed = parseHeadersJson(raw);
    Object.assign(merged, parsed);
  }
  return merged;
}

function cleanTargetUrl(rawTarget: string): { targetUrl: string; nestedHeaders: Record<string, string> } {
  let target = String(rawTarget || '').trim();
  let nestedHeaders: Record<string, string> = {};

  for (let i = 0; i < 3; i += 1) {
    if (!/^https?:\/\//i.test(target)) break;
    try {
      const parsed = new URL(target);

      for (const raw of parsed.searchParams.getAll('headers')) {
        nestedHeaders = { ...nestedHeaders, ...parseHeadersJson(raw) };
      }

      const hintedHost = String(parsed.searchParams.get('host') || '').trim();
      if (hintedHost) {
        try {
          const hostUrl = new URL(hintedHost);
          if (!nestedHeaders.origin) nestedHeaders.origin = hostUrl.origin;
          if (!nestedHeaders.referer) nestedHeaders.referer = `${hostUrl.origin}/`;
        } catch {
        }
      }

      const nestedUrl = String(parsed.searchParams.get('url') || '').trim();
      if (/^https?:\/\//i.test(nestedUrl)) {
        target = nestedUrl;
        continue;
      }

      parsed.searchParams.delete('headers');
      parsed.searchParams.delete('host');
      parsed.searchParams.delete('url');

      target = parsed.toString();
      break;
    } catch {
      break;
    }
  }

  return { targetUrl: target, nestedHeaders };
}

function buildResolverUrl(base: string, targetUrl: string, headers: Record<string, string>): string {
  const trimmedBase = base.trim();
  if (!trimmedBase) return '';

  const encoded = encodeURIComponent(targetUrl);
  const headersPayload = Object.keys(headers).length > 0 ? encodeURIComponent(JSON.stringify(headers)) : '';

  const appendHeadersParam = (value: string): string => {
    if (!headersPayload) return value;
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}headers=${headersPayload}`;
  };

  if (trimmedBase.includes('{url}')) {
    return appendHeadersParam(trimmedBase.replaceAll('{url}', encoded));
  }

  if (trimmedBase.endsWith('=') || trimmedBase.endsWith('%3D')) {
    return appendHeadersParam(`${trimmedBase}${encoded}`);
  }

  const separator = trimmedBase.includes('?') ? '&' : '?';
  return appendHeadersParam(`${trimmedBase}${separator}url=${encoded}`);
}

function isM3u8(url: string, contentType: string): boolean {
  const type = contentType.toLowerCase();
  return /\.m3u8($|\?)/i.test(url) || type.includes('application/vnd.apple.mpegurl') || type.includes('application/x-mpegurl');
}

function buildProxyUrl(url: string, headers: Record<string, string>): string {
  const params = new URLSearchParams({ url });
  if (Object.keys(headers).length > 0) {
    params.set('headers', JSON.stringify(headers));
  }
  return `/api/hls-proxy?${params.toString()}`;
}

function rewritePlaylist(content: string, playlistUrl: string, headers: Record<string, string>): string {
  const lines = content.split(/\r?\n/);

  const rewriteAbsolute = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('data:')) return trimmed;
    try {
      const absolute = new URL(trimmed, playlistUrl).toString();
      return buildProxyUrl(absolute, headers);
    } catch {
      return trimmed;
    }
  };

  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#EXT-X-KEY') && trimmed.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${rewriteAbsolute(uri)}"`);
    }

    if (trimmed.startsWith('#EXT-X-MEDIA') && trimmed.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${rewriteAbsolute(uri)}"`);
    }

    if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
      // Check for URI at the end of the line or in next line (handled by map)
      // Actually in HLS the URI for STREAM-INF is usually the NEXT line, which is handled.
      // But some variants might have URI attribute (rarely).
      return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${rewriteAbsolute(uri)}"`);
    }

    if (trimmed.startsWith('#')) return line;
    return rewriteAbsolute(trimmed);
  });

  return rewritten.join('\n');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawTargetUrl = String(searchParams.get('url') || '').trim();
  const { targetUrl, nestedHeaders } = cleanTargetUrl(rawTargetUrl);
  const forwardHeaders = {
    ...nestedHeaders,
    ...parseForwardHeaders(searchParams),
  };

  if (!/^https?:\/\//i.test(targetUrl)) {
    return NextResponse.json({ success: false, error: 'Invalid target url' }, { status: 400 });
  }

  try {
    const target = new URL(targetUrl);
    const upstreamHeaders: Record<string, string> = {
      ...forwardHeaders,
      referer: forwardHeaders.referer || `${target.origin}/`,
      origin: forwardHeaders.origin || target.origin,
      accept: forwardHeaders.accept || '*/*',
    };
    const rangeHeader = forwardHeaders.range || request.headers.get('range') || '';
    if (rangeHeader) {
      upstreamHeaders.range = rangeHeader;
    }

    let upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok && (upstream.status === 401 || upstream.status === 403 || upstream.status === 429)) {
      const resolverBase = String(
        process.env.DIRECT_RESOLVER_URL || ''
      ).trim();
      const resolverUrl = buildResolverUrl(resolverBase, targetUrl, forwardHeaders);
      if (resolverUrl) {
        try {
          const resolverResponse = await fetch(resolverUrl, {
            signal: AbortSignal.timeout(15000),
          });
          if (resolverResponse.ok) {
            upstream = resolverResponse;
          }
        } catch {
        }
      }
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return new NextResponse(text || `Upstream failed with HTTP ${upstream.status}`, {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    const contentType = upstream.headers.get('content-type') || '';

    if (isM3u8(targetUrl, contentType)) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, targetUrl, forwardHeaders);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': contentType || 'application/octet-stream',
        'cache-control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'HLS proxy failed',
    }, { status: 500 });
  }
}
