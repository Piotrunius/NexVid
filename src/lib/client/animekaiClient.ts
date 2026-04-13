/* ============================================
   AnimeKAI Client-Side Scraper
   Moves scraping to the browser to bypass server-side blocks.
   Uses public CORS proxies for anikai.to and direct calls for enc-dec.app.
   ============================================ */

const BASE = "https://anikai.to";
const ENCDEC_ENC = "https://enc-dec.app/api/enc-kai";
const ENCDEC_DEC_KAI = "https://enc-dec.app/api/dec-kai";
const ENCDEC_DEC_MEGA = "https://enc-dec.app/api/dec-mega";

export interface AnimeSearchResult {
  title: string;
  slug: string;
  aniId?: string;
}

export interface AnimeEpisode {
  number: string;
  token: string;
  hasSub: boolean;
  hasDub: boolean;
}

export interface AnimeSourceResult {
  playlist: string;
  tracks: any[];
  skip: any;
  headers: Record<string, string>;
}

/** Fetch utility using private worker proxy for anikai.to */
async function proxyFetch(targetUrl: string, headers: Record<string, string> = {}): Promise<string> {
  const url = new URL("/api/proxy/public/scrape", window.location.origin);
  url.searchParams.set("url", targetUrl);

  const res = await fetch(url.toString(), {
    headers: {
      ...headers,
      "X-Requested-With": "XMLHttpRequest", // Ensure AJAX hint is passed
    }
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Proxy failed: ${res.status}`);
  }

  return await res.text();
}

/** Direct JSON fetch for enc-dec.app (CORS is open) */
async function encFetch(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      "Referer": "https://anikai.to/", // Important for backend
    },
  });
  if (!res.ok) throw new Error(`Enc-Dec API failed: ${res.status}`);
  return await res.json();
}

/** Re-implementation of title cleaning */
export function cleanAnimeTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\(TV\)/gi, "")
    .replace(/: Final Season/gi, "")
    .replace(/:/g, "")
    .replace(/\[Sub\]/gi, "")
    .replace(/\[Dub\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Encoding utility */
async function encodeToken(text: string): Promise<string | null> {
  try {
    const url = new URL(ENCDEC_ENC);
    url.searchParams.set("text", text);
    const data = await encFetch(url.toString());
    return data?.status === 200 ? data.result : null;
  } catch {
    return null;
  }
}

/** Decoding Kai utility */
async function decodeKai(text: string): Promise<any | null> {
  try {
    const data = await encFetch(ENCDEC_DEC_KAI, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return data?.status === 200 ? data.result : null;
  } catch {
    return null;
  }
}

/** Decoding Mega utility */
async function decodeMega(text: string): Promise<any | null> {
  try {
    const data = await encFetch(ENCDEC_DEC_MEGA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, agent: UA }),
    });
    return data?.status === 200 ? data.result : null;
  } catch {
    return null;
  }
}

// ==== Exported Scraper Functions ====

export async function clientAnimeSearch(keyword: string): Promise<AnimeSearchResult[]> {
  const url = `${BASE}/ajax/anime/search?keyword=${encodeURIComponent(keyword)}`;
  const html = await proxyFetch(url, { "X-Requested-With": "XMLHttpRequest" });
  
  // Use native DOMParser in browser
  const parser = new DOMParser();
  const doc = parser.parseFromString(JSON.parse(html).result?.html || "", "text/html");
  const items = doc.querySelectorAll("a.aitem");
  
  return Array.from(items).map(item => {
    const href = item.getAttribute("href") || "";
    return {
      title: item.querySelector("h6.title")?.textContent?.trim() || "",
      slug: href.startsWith("/watch/") ? href.replace("/watch/", "") : href,
      aniId: item.getAttribute("data-id") || undefined,
    };
  }).filter(i => i.title);
}

export async function clientAnimeInfo(slug: string): Promise<{ aniId: string }> {
  const url = `${BASE}/watch/${slug}`;
  const html = await proxyFetch(url);
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  
  let aniId = "";
  
  // Try syncData script first
  const syncScript = doc.querySelector("script#syncData")?.textContent || "";
  try {
    aniId = JSON.parse(syncScript)?.anime_id || "";
  } catch {}
  
  // Fallback 1: Data attributes on main container
  if (!aniId) {
    aniId = doc.querySelector(".show-data")?.getAttribute("data-id") || "";
  }
  
  // Fallback 2: Episodes request param from buttons
  if (!aniId) {
    const epBtn = doc.querySelector(".eplist a, .btn-play");
    aniId = epBtn?.getAttribute("data-id") || epBtn?.getAttribute("ani_id") || "";
  }

  // Fallback 3: Meta tags
  if (!aniId) {
    aniId = doc.querySelector('meta[name="anime-id"]')?.getAttribute("content") || "";
  }
  
  // Fallback 4: URL pattern (last resort) - extract from 'slug' or 'url'
  if (!aniId) {
    const parts = slug.split("-");
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.length >= 4 && lastPart.length <= 8) {
      aniId = lastPart;
      console.log("[Scraper] Potential ID found in URL slug:", aniId);
    }
  }

  // Fallback 5: Global variables in raw HTML
  if (!aniId) {
    const match = html.match(/anime_id\s*[:=]\s*["']([^"']+)["']/i);
    if (match) aniId = match[1];
  }
  
  if (!aniId) {
    console.warn("[Scraper] Warning: All ID discovery methods failed for slug:", slug);
  } else {
    console.log("[Scraper] Resolved internal ID:", aniId);
  }
  
  return { aniId, html };
}

export async function clientAnimeEpisodes(aniId: string, slug?: string, html?: string): Promise<AnimeEpisode[]> {
  let doc: Document;
  const parser = new DOMParser();

  if (html) {
    doc = parser.parseFromString(html, "text/html");
  } else if (slug) {
    const watchHtml = await proxyFetch(`${BASE}/watch/${slug}`);
    doc = parser.parseFromString(watchHtml, "text/html");
  } else {
    // Fallback to AJAX if no slug/html provided (legacy way)
    const sessionToken = await encodeToken(aniId);
    if (!sessionToken) throw new Error("Session token failed");
    const url = `${BASE}/ajax/episodes/list?ani_id=${aniId}&_=${sessionToken}`;
    const rawData = await proxyFetch(url, { "X-Requested-With": "XMLHttpRequest" });
    const ajaxHtml = JSON.parse(rawData)?.result || "";
    doc = parser.parseFromString(ajaxHtml, "text/html");
  }

  // Try parsing from HTML (common in newer anikai versions)
  let items = doc.querySelectorAll(".eplist a, .episode-list a, .episodes a");
  
  if (items.length === 0 && !html) {
    // If we tried slug/html and failed, try the AJAX one anyway
    try {
      const sessionToken = await encodeToken(aniId);
      const url = `${BASE}/ajax/episodes/list?ani_id=${aniId}&_=${sessionToken}`;
      const rawData = await proxyFetch(url, { "X-Requested-With": "XMLHttpRequest" });
      const ajaxHtml = JSON.parse(rawData)?.result || "";
      const ajaxDoc = parser.parseFromString(ajaxHtml, "text/html");
      items = ajaxDoc.querySelectorAll("a");
    } catch (e) {
      console.error("[Scraper] AJAX fallback failed:", e);
    }
  }

  return Array.from(items).map(item => {
    const langs = parseInt(item.getAttribute("langs") || item.getAttribute("data-langs") || "0", 10);
    return {
      number: item.getAttribute("num") || item.getAttribute("data-num") || item.textContent?.trim() || "",
      token: item.getAttribute("token") || item.getAttribute("data-token") || "",
      hasSub: !!(langs & 1) || item.classList.contains("sub"),
      hasDub: !!(langs & 2) || item.classList.contains("dub"),
    };
  }).filter(ep => ep.token);
}

export async function clientAnimeServers(epToken: string): Promise<Record<string, any[]>> {
  const encoded = await encodeToken(epToken);
  if (!encoded) throw new Error("Server token failed");
  
  const url = `${BASE}/ajax/links/list?token=${epToken}&_=${encoded}`;
  const rawData = await proxyFetch(url, { "X-Requested-With": "XMLHttpRequest" });
  const html = JSON.parse(rawData)?.result || "";
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const groups = doc.querySelectorAll(".server-items");
  const servers: Record<string, any[]> = {};
  
  groups.forEach(group => {
    const lang = group.getAttribute("data-id") || "unknown";
    servers[lang] = Array.from(group.querySelectorAll(".server")).map(srv => ({
      name: srv.textContent?.trim(),
      linkId: srv.getAttribute("data-lid"),
    }));
  });
  
  return servers;
}

export async function clientAnimeSource(linkId: string): Promise<AnimeSourceResult> {
  const encoded = await encodeToken(linkId);
  const url = `${BASE}/ajax/links/view?id=${linkId}&_=${encoded}`;
  const rawView = await proxyFetch(url, { "X-Requested-With": "XMLHttpRequest" });
  
  const encrypted = JSON.parse(rawView)?.result || "";
  const embedData = await decodeKai(encrypted);
  if (!embedData?.url) throw new Error("Embed decryption failed");
  
  const embedUrl = embedData.url;
  const videoId = embedUrl.replace(/\/$/, "").split("/").pop() || "";
  const embedBase = embedUrl.includes("/e/") ? embedUrl.split("/e/")[0] : embedUrl.replace(/\/[^/]+$/, "");
  
  const mediaJson = await proxyFetch(`${embedBase}/media/${videoId}`);
  const finalData = await decodeMega(JSON.parse(mediaJson)?.result || "");
  if (!finalData) throw new Error("Mega decryption failed");
  
  const sources = Array.isArray(finalData.sources) ? finalData.sources : [];
  const hlsSource = sources.find((s: any) => s.file?.includes(".m3u8")) ?? sources[0];
  
  return {
    playlist: hlsSource?.file || "",
    tracks: Array.isArray(finalData.tracks) ? finalData.tracks : [],
    skip: embedData.skip || {},
    headers: { referer: `${embedBase}/`, origin: embedBase },
  };
}
