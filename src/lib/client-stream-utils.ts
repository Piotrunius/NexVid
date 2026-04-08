/**
 * Client-side request signing utility for beta/alpha sources
 * Optional: Add to frontend to verify requests are from the app
 */

/**
 * Generate HMAC-SHA256 signature for stream requests
 * @param tmdbId TMDB ID
 * @param type 'movie' or 'show'
 * @param sourceId 'beta' or 'alpha'
 * @param secret Shared secret (same as server NEXVID_APP_SECRET)
 * @returns Base64 encoded signature
 */
export async function generateStreamRequestSignature(
  tmdbId: string,
  type: string,
  sourceId: string,
  secret: string = process.env.REACT_APP_NEXVID_SECRET || ''
): Promise<{ signature: string; timestamp: number }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${tmdbId}:${type}:${sourceId}:${timestamp}`;

  // Use SubtleCrypto for browser compatibility
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { signature: hex, timestamp };
}

/**
 * Make authenticated stream request with optional signature
 */
export async function fetchStream(
  tmdbId: string,
  type: 'movie' | 'show',
  sourceId: string,
  options?: {
    season?: number;
    episode?: number;
    title?: string;
    febboxToken?: string;
    includeSignature?: boolean;
    secret?: string;
  }
): Promise<any> {
  const params = new URLSearchParams({
    tmdbId,
    type,
    source: sourceId,
  });

  if (options?.season) params.append('season', String(options.season));
  if (options?.episode) params.append('episode', String(options.episode));
  if (options?.title) params.append('title', options.title);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add FebBox token if provided (required for alpha source)
  if (options?.febboxToken) {
    headers['X-FebBox-Cookie'] = options.febboxToken;
  }

  // Add signature if requested
  if (options?.includeSignature) {
    const { signature, timestamp } = await generateStreamRequestSignature(
      tmdbId,
      type,
      sourceId,
      options?.secret
    );
    headers['X-NexVid-Signature'] = signature;
    headers['X-NexVid-Timestamp'] = String(timestamp);
  }

  const response = await fetch(`/api/stream?${params.toString()}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch stream');
  }

  return response.json();
}

/**
 * Utility to get available sources for a media type
 */
export function getAvailableSources(options?: {
  hasFebBoxToken?: boolean;
}): Array<{
  id: string;
  name: string;
  description: string;
  tier: 'free' | 'experimental' | 'premium';
  requiresToken?: boolean;
}> {
  const sources: Array<{
    id: string;
    name: string;
    description: string;
    tier: 'free' | 'experimental' | 'premium';
    requiresToken?: boolean;
  }> = [
    {
      id: 'febbox',
      name: 'FebBox',
      description: 'Default stable source',
      tier: 'free',
    },
    {
      id: 'pobreflix',
      name: 'Pobreflix',
      description: 'Free community provider',
      tier: 'free',
    },
    {
      id: 'beta',
      name: 'Pobreflix (Beta)',
      description: 'Experimental source (rate-limited)',
      tier: 'experimental',
    },
  ];

  // Only show alpha source if user has FebBox token
  if (options?.hasFebBoxToken) {
    sources.push({
      id: 'alpha',
      name: 'FebBox (Premium)',
      description: 'Premium source with personal FebBox token',
      tier: 'premium',
      requiresToken: true,
    });
  }

  return sources;
}
