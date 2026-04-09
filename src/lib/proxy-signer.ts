/**
 * Proxy Signer Utility
 * Used to sign URLs for the Cloudflare Worker proxy.
 */

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', 
    keyData, 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Signs a URL for use with the NexVid proxy.
 * @param targetUrl The upstream URL to proxy
 * @param sessionId The user's session ID/token (to bind the signature)
 * @param ttlSeconds How long the signature should be valid (default 4 hours)
 */
export async function signProxyUrl(targetUrl: string, sessionId: string, ttlSeconds = 14400): Promise<string> {
  const secret = process.env.SIGNING_SECRET || process.env.NEXT_PUBLIC_SIGNING_SECRET;
  if (!secret) {
    console.warn('[ProxySigner] SIGNING_SECRET is not configured. Returning original URL.');
    return targetUrl;
  }

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  
  // We hash the sessionId before including it in the HMAC message to avoid any potential leaking
  const sessionHash = await sha256Hex(sessionId);
  const message = `${targetUrl}|${sessionHash}|${expires}`;
  const sig = await hmacSha256(message, secret);

  const proxyBase = 'https://nexvid.online/api/proxy';
  const signedUrl = new URL(proxyBase);
  signedUrl.searchParams.set('url', targetUrl);
  signedUrl.searchParams.set('sig', sig);
  signedUrl.searchParams.set('exp', expires.toString());

  return signedUrl.toString();
}

/**
 * Batch signs all URLs in a stream response object
 */
export async function signStreamData(data: any, sessionId: string): Promise<any> {
  if (!data) return data;
  const signedData = { ...data };

  // Sign single URL (HLS)
  if (signedData.url) {
    signedData.url = await signProxyUrl(signedData.url, sessionId);
  }
  if (signedData.playlist) {
    signedData.playlist = await signProxyUrl(signedData.playlist, sessionId);
  }

  // Sign qualities (File)
  if (signedData.qualities) {
    const signedQualities: any = {};
    for (const [q, val] of Object.entries(signedData.qualities) as [string, any][]) {
      signedQualities[q] = {
        ...val,
        url: await signProxyUrl(val.url, sessionId)
      };
    }
    signedData.qualities = signedQualities;
  }

  return signedData;
}
