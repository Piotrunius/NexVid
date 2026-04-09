/**
 * Request verification for stream sources
 * Ensures requests come from legitimate app instances
 */

import { NextRequest } from 'next/server';

const CANONICAL_HOST = (process.env.NEXT_PUBLIC_CANONICAL_HOST || 'nexvid.online').toLowerCase();
const ALLOWED_HOSTS = new Set([CANONICAL_HOST, `www.${CANONICAL_HOST}`]);

function extractHostname(headerValue: string | null): string | null {
  if (!headerValue) return null;

  try {
    return new URL(headerValue).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Restrict requests to pages served from nexvid.online.
 * In development this check is skipped.
 */
export function isRequestFromAllowedSite(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const hostHeader = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (hostHeader && !ALLOWED_HOSTS.has(hostHeader)) {
    return false;
  }

  const originHost = extractHostname(request.headers.get('origin'));
  const refererHost = extractHostname(request.headers.get('referer'));

  if (originHost && !ALLOWED_HOSTS.has(originHost)) {
    return false;
  }

  if (refererHost && !ALLOWED_HOSTS.has(refererHost)) {
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
