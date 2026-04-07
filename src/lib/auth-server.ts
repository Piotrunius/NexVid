import { NextRequest } from 'next/server';

const DEFAULT_PROD_API_URL = 'https://nexvid-proxy.piotrunius.workers.dev';

function resolveCloudApiUrl(): string {
  const configuredValue = process.env.NEXT_PUBLIC_API_URL || '';
  const configured = (configuredValue || '').trim().replace(/\/+$/, '');
  return configured || DEFAULT_PROD_API_URL;
}

/**
 * Validates a cloud session by calling the external backend's /auth/me endpoint.
 * This should be used in server-side API routes to verify that the request comes from an authenticated user.
 */
export async function isValidCloudSession(request: Request | NextRequest, tokenOverride?: string): Promise<boolean> {
  const apiBase = resolveCloudApiUrl();
  const incomingCookie = request.headers.get('cookie') || '';
  
  // Extract token from Authorization header or override
  let effectiveToken = tokenOverride;
  if (!effectiveToken) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      effectiveToken = authHeader.substring(7);
    }
  }

  // Clean the token from common placeholder strings if they leaked into headers
  if (effectiveToken === 'undefined' || effectiveToken === 'null' || effectiveToken === '') {
    effectiveToken = undefined;
  }

  // If no token and no session cookie, session is invalid
  const hasSessionCookie = incomingCookie.includes('nexvid_session=');
  if (!effectiveToken && !hasSessionCookie) {
    return false;
  }

  try {
    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache',
    };
    if (effectiveToken) {
      headers.Authorization = `Bearer ${effectiveToken}`;
    }
    if (incomingCookie) {
      headers.Cookie = incomingCookie;
    }

    const response = await fetch(`${apiBase}/auth/me`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      // Short timeout to avoid hanging the edge function
      // @ts-ignore
      signal: AbortSignal.timeout(5000),
    });
    
    return response.ok;
  } catch (err) {
    console.error('[AuthServer] Session validation failed:', err);
    return false;
  }
}
