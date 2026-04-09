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

function parseCsvSet(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchHostname(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const candidate = pattern.toLowerCase();
  if (candidate === '*') return true;
  if (candidate.startsWith('*.')) {
    const base = candidate.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === candidate;
}

function isAllowedHost(hostname: string): boolean {
  const allowed = parseCsvSet(process.env.PROXY_ALLOWED_HOSTS || process.env.NEXT_PUBLIC_PROXY_ALLOWED_HOSTS);
  if (allowed.length === 0) return false;
  return allowed.some((pattern) => matchHostname(hostname, pattern));
}

function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((value, index) => !/^\d+$/.test(parts[index]) || Number.isNaN(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets;
}

function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // Carrier-grade NAT
  return false;
}

function expandIPv6(hostname: string): number[] | null {
  const normalized = hostname.toLowerCase();
  if (!normalized.includes(':')) return null;
  if (normalized.includes('.') && normalized.includes(':')) {
    const lastColon = normalized.lastIndexOf(':');
    const head = normalized.slice(0, lastColon);
    const tail = normalized.slice(lastColon + 1);
    const ipv4 = parseIPv4(tail);
    if (!ipv4) return null;
    const mapped = `${head}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
    return expandIPv6(mapped);
  }

  const parts = normalized.split('::');
  if (parts.length > 2) return null;

  const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const right = parts[1] ? parts[1].split(':').filter(Boolean) : [];
  if (left.length + right.length > 8) return null;
  if (parts.length === 1 && left.length !== 8) return null;

  const fillCount = 8 - (left.length + right.length);
  const full = [...left, ...Array(fillCount).fill('0'), ...right];
  if (full.length !== 8) return null;

  const hextets = full.map((part) => Number.parseInt(part, 16));
  if (hextets.some((value, index) => !/^[0-9a-f]{1,4}$/i.test(full[index]) || Number.isNaN(value) || value < 0 || value > 0xffff)) {
    return null;
  }
  return hextets;
}

function isPrivateIPv6(hextets: number[]): boolean {
  const [a, b, c, d, e, f, g, h] = hextets;
  const isUnspecified = hextets.every((value) => value === 0);
  const isLoopback = a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && h === 1;
  const isUniqueLocal = (a & 0xfe00) === 0xfc00; // fc00::/7
  const isLinkLocal = (a & 0xffc0) === 0xfe80; // fe80::/10
  if (isUnspecified || isLoopback || isUniqueLocal || isLinkLocal) return true;

  // IPv4-mapped IPv6 address ::ffff:x.x.x.x
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) {
    const ipv4 = [g >> 8, g & 0xff, h >> 8, h & 0xff];
    return isPrivateIPv4(ipv4);
  }

  return false;
}

function isBlockedTargetHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.internal')) return true;

  const ipv4 = parseIPv4(host);
  if (ipv4) {
    if (isPrivateIPv4(ipv4)) return true;
    if (host === '169.254.169.254') return true; // cloud metadata endpoint
    return false;
  }

  const ipv6 = expandIPv6(host);
  if (ipv6) {
    return isPrivateIPv6(ipv6);
  }

  return false;
}

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
    const hostname = target.hostname.toLowerCase();
    if (isBlockedTargetHost(hostname)) {
      return NextResponse.json({ success: false, error: 'Target host is not allowed' }, { status: 403 });
    }
    if (!isAllowedHost(hostname)) {
      return NextResponse.json({ success: false, error: 'Target host is not in allowlist' }, { status: 403 });
    }

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
        process.env.DIRECT_RESOLVER_URL || process.env.NEXT_PUBLIC_DIRECT_RESOLVER_URL || ''
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
