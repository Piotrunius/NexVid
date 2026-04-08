import { isValidCloudSession } from '@/lib/auth-server';
import { isRequestFromAllowedSite } from '@/lib/request-verification';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CANONICAL_HOST = (process.env.NEXT_PUBLIC_CANONICAL_HOST || 'nexvid.online').toLowerCase();
const REDIRECT_HOSTS = new Set(['nexvid.pl', 'www.nexvid.pl', 'www.nexvid.online']);

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // Avoid overriding more comprehensive CSP set elsewhere.
  if (!response.headers.has('Content-Security-Policy')) {
    response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  }

  return response;
}


export async function middleware(request: NextRequest) {
  const hostHeader = request.headers.get('host') || '';
  const host = hostHeader.split(':')[0].toLowerCase();

  const url = request.nextUrl.pathname;

  // Lock API usage to requests coming from nexvid.online and throttle globally.
  if (url.startsWith('/api/')) {
    if (!isRequestFromAllowedSite(request)) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'Forbidden origin' },
          { status: 403 }
        )
      );
    }
  }

  // Protect /admin route (requires cloud session)
  if (url.startsWith('/admin')) {
    const token = request.cookies.get('nexvid_session')?.value;

    if (!token) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      return applySecurityHeaders(NextResponse.redirect(loginUrl));
    }

    // Validation of token correctness through contact with Worker
    const isValid = await isValidCloudSession(request, token);

    if (!isValid) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      const response = applySecurityHeaders(NextResponse.redirect(loginUrl));
      response.cookies.delete('nexvid_session'); // Removing the forged cookie
      return response;
    }
  }

  if (!host || host === CANONICAL_HOST) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (!REDIRECT_HOSTS.has(host)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const targetUrl = request.nextUrl.clone();
  targetUrl.protocol = 'https';
  targetUrl.host = CANONICAL_HOST;

  return applySecurityHeaders(NextResponse.redirect(targetUrl, 308));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
