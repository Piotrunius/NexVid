/**
 * Request verification for stream sources
 * Ensures requests come from legitimate app instances
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';

const NEXVID_APP_SECRET = process.env.NEXVID_APP_SECRET || 'nexvid-app-default-secret';

/**
 * Generate a request signature
 * Used by the frontend to sign requests for beta/alpha sources
 */
export function generateRequestSignature(
  tmdbId: string,
  type: string,
  sourceId: string,
  timestamp: number
): string {
  const payload = `${tmdbId}:${type}:${sourceId}:${timestamp}`;
  return crypto
    .createHmac('sha256', NEXVID_APP_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Verify request signature (optional - adds extra security layer)
 * If signature provided, it must be valid
 * If not provided, request is still allowed (for backwards compatibility)
 */
export function verifyRequestSignature(
  request: NextRequest,
  tmdbId: string,
  type: string,
  sourceId: string
): boolean {
  const signature = request.headers.get('x-nexvid-signature');
  const timestamp = request.headers.get('x-nexvid-timestamp');

  // If no signature provided, that's OK (backwards compatible)
  if (!signature || !timestamp) {
    return true;
  }

  // Verify signature is recent (within 5 minutes)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
    console.warn('[Stream] Signature timestamp too old or invalid');
    return false;
  }

  // Verify signature matches
  const expectedSignature = generateRequestSignature(
    tmdbId,
    type,
    sourceId,
    Math.floor(requestTime / 1000) // Round to seconds
  );

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    console.warn('[Stream] Invalid request signature');
  }

  return isValid;
}

/**
 * Check if request comes from allowed app
 * Can add more sophisticated checks here (UA, IP whitelist, etc)
 */
export function isRequestFromApp(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';

  // Allow typical browser user agents (app can set custom UA if needed)
  if (userAgent.includes('Mozilla')) return true;

  // Allow requests with valid signature
  return request.headers.has('x-nexvid-signature');
}
