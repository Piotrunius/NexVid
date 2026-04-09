/**
 * Proxy Utility
 * Used to proxy URLs for the NexVid player.
 */

/**
 * Proxies a URL for use with the NexVid proxy.
 * (No longer signs with HMAC, as signatures were removed for simplicity)
 * @param targetUrl The upstream URL to proxy
 * @param _sessionId Ignored (previously used for signing)
 */
export async function signProxyUrl(targetUrl: string, _sessionId?: string): Promise<string> {
  const proxyBase = '/api/proxy'; // Use relative path for Next.js proxying
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://nexvid.online';
  
  try {
    const proxiedUrl = new URL(proxyBase, baseUrl);
    proxiedUrl.searchParams.set('url', targetUrl);
    return proxiedUrl.toString();
  } catch (err) {
    console.error('[ProxySigner] Failed to construct proxy URL:', err);
    return targetUrl; // Fallback to original URL if proxy construction fails
  }
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
