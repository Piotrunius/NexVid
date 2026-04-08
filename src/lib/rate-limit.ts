/**
 * Rate limiting utilities for API protection
 * Implements per-IP and per-user rate limiting
 */

import { NextRequest } from 'next/server';

// In-memory store for rate limits (in production, use Redis)
// Format: key -> { count: number; resetTime: number }
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Configuration (in seconds)
export const RATE_LIMIT_CONFIG = {
  // Global API protection: 120 requests per minute per IP
  apiGlobal: { maxRequests: 120, windowSeconds: 60 },

  // Stream endpoint: 30 requests per minute per IP
  stream: { maxRequests: 30, windowSeconds: 60 },

  // Beta source: 15 requests per minute (experimental/unstable)
  streamBeta: { maxRequests: 15, windowSeconds: 60 },

  // Alpha source: 10 requests per minute (premium, requires FebBox token)
  streamAlpha: { maxRequests: 10, windowSeconds: 60 },

  // Auth endpoints: 5 requests per minute per IP
  auth: { maxRequests: 5, windowSeconds: 60 },

  // AI assistant: 10 requests per minute per IP
  aiAssistant: { maxRequests: 10, windowSeconds: 60 },

  // Segments: 20 requests per minute per IP
  segments: { maxRequests: 20, windowSeconds: 60 },

  // Public config: 10 requests per minute per IP
  publicConfig: { maxRequests: 10, windowSeconds: 60 },
};

function getClientIp(request: NextRequest): string {
  // Use the IP address provided by the platform if available (Next.js/Vercel/CF)
  const ip = (request as any).ip || request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  if (ip) return ip;

  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return request.headers.get('x-client-ip') || 'unknown';
}

/**
 * Check if request should be rate limited
 * Returns null if allowed, or remaining time in seconds if blocked
 */
export function checkRateLimit(
  request: NextRequest,
  config: { maxRequests: number; windowSeconds: number },
  identifier?: string // Optional: use authenticated user ID instead of IP
): { allowed: boolean; retryAfter?: number } {
  const key = identifier || `ip:${getClientIp(request)}`;
  const now = Date.now();

  const current = rateLimitStore.get(key) || { count: 0, resetTime: 0 };

  // If window has expired, reset counter
  if (now >= current.resetTime) {
    current.count = 0;
    current.resetTime = now + config.windowSeconds * 1000;
  }

  // Increment request count
  current.count++;
  rateLimitStore.set(key, current);

  // Check if limit exceeded
  if (current.count > config.maxRequests) {
    const retryAfter = Math.ceil((current.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

/**
 * Clean up old entries to prevent memory leak
 * Call periodically (e.g., in a cron job)
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of rateLimitStore.entries()) {
    if (now >= value.resetTime) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}
