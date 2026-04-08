/**
 * Request verification for stream sources
 * Ensures requests come from legitimate app instances
 * Uses Web Crypto API for Edge Runtime compatibility
 */

import { NextRequest } from 'next/server';

const NEXVID_APP_SECRET = process.env.NEXVID_APP_SECRET || 'nexvid-app-default-secret';

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a request signature using Web Crypto API
 * Used by the frontend to sign requests for beta/alpha sources
 */
export async function generateRequestSignature(
  tmdbId: string,
  type: string,
  sourceId: string,
  timestamp: number
): Promise<string> {
  const payload = `${tmdbId}:${type}:${sourceId}:${timestamp}`;
  const encoder = new TextEncoder();

  const keyData = encoder.encode(NEXVID_APP_SECRET);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToHex(signature);
}

/**
 * Verify request signature (optional - adds extra security layer)
 * If signature provided, it must be valid
 * If not provided, request is still allowed (for backwards compatibility)
 */
export async function verifyRequestSignature(
  request: NextRequest,
  tmdbId: string,
  type: string,
  sourceId: string
): Promise<boolean> {
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
  const expectedSignature = await generateRequestSignature(
    tmdbId,
    type,
    sourceId,
    Math.floor(requestTime / 1000) // Round to seconds
  );

  const isValid = signature === expectedSignature;

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
