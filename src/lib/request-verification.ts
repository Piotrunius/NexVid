/**
 * Request verification for stream sources
 * Ensures requests come from legitimate app instances
 */

import { NextRequest } from 'next/server';

const CANONICAL_HOST = (process.env.NEXT_PUBLIC_CANONICAL_HOST || 'nexvid.online').toLowerCase();

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

function extractHostname(headerValue: string | null): string | null {
  if (!headerValue) return null;

  try {
    return new URL(headerValue).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isHostAllowed(host: string): boolean {
  const allowedPatterns = parseCsvSet(process.env.ALLOWED_ORIGINS);

  // Implied defaults if not specified in env
  const defaultHosts = [CANONICAL_HOST, `www.${CANONICAL_HOST}`];

  // Check against explicit patterns
  const isAllowed = allowedPatterns.some(pattern => {
    let hostPattern = pattern;
    if (pattern.startsWith('http://') || pattern.startsWith('https://')) {
      try {
        hostPattern = new URL(pattern).hostname;
      } catch {
        return false;
      }
    }
    return matchHostname(host, hostPattern);
  });

  if (isAllowed) return true;

  // Check against defaults
  return defaultHosts.some(def => matchHostname(host, def));
}

/**
 * Restrict requests to pages served from allowed origins.
 * In development this check is skipped.
 */
export function isRequestFromAllowedSite(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const hostHeader = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (hostHeader && !isHostAllowed(hostHeader)) {
    return false;
  }

  const originHost = extractHostname(request.headers.get('origin'));
  const refererHost = extractHostname(request.headers.get('referer'));

  if (originHost && !isHostAllowed(originHost)) {
    return false;
  }

  if (refererHost && !isHostAllowed(refererHost)) {
    return false;
  }

  // Require at least one browser provenance header in production.
  if (!originHost && !refererHost) {
    return false;
  }

  const secFetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site') {
    return false;
  }

  return true;
}
