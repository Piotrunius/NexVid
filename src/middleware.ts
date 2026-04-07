import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CANONICAL_HOST = (process.env.NEXT_PUBLIC_CANONICAL_HOST || 'nexvid.online').toLowerCase();
const REDIRECT_HOSTS = new Set(['nexvid.pl', 'www.nexvid.pl', 'www.nexvid.online']);

function applyAntiIframeHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  return response;
}

import { isValidCloudSession } from '@/lib/auth-server';


export async function middleware(request: NextRequest) {
  const hostHeader = request.headers.get('host') || '';
  const host = hostHeader.split(':')[0].toLowerCase();

  const url = request.nextUrl.pathname;

  if (url.startsWith('/admin')) {
    const token = request.cookies.get('nexvid_session')?.value;

    if (!token) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      return applyAntiIframeHeaders(NextResponse.redirect(loginUrl));
    }

    // Validation of token correctness through contact with Worker
    const isValid = await isValidCloudSession(request, token);

    if (!isValid) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      const response = applyAntiIframeHeaders(NextResponse.redirect(loginUrl));
      response.cookies.delete('nexvid_session'); // Removing the forged cookie
      return response;
    }
  }

  if (!host || host === CANONICAL_HOST) {
    return applyAntiIframeHeaders(NextResponse.next());
  }

  if (!REDIRECT_HOSTS.has(host)) {
    return applyAntiIframeHeaders(NextResponse.next());
  }

  const targetUrl = request.nextUrl.clone();
  targetUrl.protocol = 'https';
  targetUrl.host = CANONICAL_HOST;

  return applyAntiIframeHeaders(NextResponse.redirect(targetUrl, 308));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
