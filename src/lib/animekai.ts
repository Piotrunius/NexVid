/* ============================================
   AnimeKAI Scraper Library
   Scrapes anikai.to directly — no external server required.
   Pipeline mirrors the reference AnimeKAI-API Python code.
   ============================================ */

import * as cheerio from "cheerio";

// ---- Constants ----

const BASE = "https://anikai.to";
const SEARCH_URL = `${BASE}/ajax/anime/search`;
const EPISODES_URL = `${BASE}/ajax/episodes/list`;
const SERVERS_URL = `${BASE}/ajax/links/list`;
const LINKS_VIEW_URL = `${BASE}/ajax/links/view`;

const ENCDEC_ENC = "https://enc-dec.app/api/enc-kai";
const ENCDEC_DEC_KAI = "https://enc-dec.app/api/dec-kai";
const ENCDEC_DEC_MEGA = "https://enc-dec.app/api/dec-mega";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${BASE}/`,
};

const AJAX_HEADERS: Record<string, string> = {
  ...BASE_HEADERS,
  "X-Requested-With": "XMLHttpRequest",
};

const TIMEOUT_MS = 20_000;

// ---- Public Types ----

export interface AnimeSearchResult {
  title: string;
  japaneseTitle: string;
  slug: string;
  url: string;
  poster: string;
  subEpisodes: string;
  dubEpisodes: string;
  totalEpisodes: string;
  year: string;
  type: string;
  rating: string;
}

export interface AnimeInfo {
  aniId: string;
  slug: string;
  title: string;
  japaneseTitle: string;
  description: string;
  poster: string;
  banner: string;
  subEpisodes: string;
  dubEpisodes: string;
  type: string;
  malScore: string;
  detail: Record<string, string | string[]>;
}

export interface AnimeEpisode {
  number: string;
  slug: string;
  title: string;
  japaneseTitle: string;
  token: string;
  hasSub: boolean;
  hasDub: boolean;
}

export interface AnimeServer {
  name: string;
  serverId: string;
  episodeId: string;
  linkId: string;
}

export interface AnimeServersResult {
  servers: Record<string, AnimeServer[]>; // key: "1" = sub, "2" = dub, etc.
  watching: string;
}

export interface AnimeSourceTrack {
  file: string;
  label: string;
  kind: string;
  default?: boolean;
}

export interface AnimeSourceResult {
  playlist: string;
  tracks: AnimeSourceTrack[];
  skip: Record<string, unknown>;
  download: string;
  headers?: Record<string, string>;
}

// ---- Helpers ----

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Calls enc-dec.app to encode a token (enc-kai endpoint).
 */
async function encodeToken(text: string): Promise<string | null> {
  try {
    const url = new URL(ENCDEC_ENC);
    url.searchParams.set("text", text);
    const res = await fetchWithTimeout(url.toString(), {
      headers: BASE_HEADERS,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.status === 200 ? (data?.result ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Calls enc-dec.app to decode an encrypted AnimeKAI result (dec-kai endpoint).
 */
async function decodeKai(text: string): Promise<any | null> {
  try {
    const res = await fetchWithTimeout(ENCDEC_DEC_KAI, {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.status === 200 ? (data?.result ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Calls enc-dec.app to decode an encrypted media result (dec-mega endpoint).
 */
async function decodeMega(text: string): Promise<any | null> {
  try {
    const res = await fetchWithTimeout(ENCDEC_DEC_MEGA, {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ text, agent: UA }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.status === 200 ? (data?.result ?? null) : null;
  } catch {
    return null;
  }
}

// ---- Public API ----

/**
 * Search anime on anikai.to by keyword.
 * Returns array of matches ordered by relevance.
 */
export async function animekaiSearch(
  keyword: string,
): Promise<AnimeSearchResult[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("keyword", keyword);

  const res = await fetchWithTimeout(url.toString(), { headers: AJAX_HEADERS });
  if (!res.ok) throw new Error(`AnimeKAI search failed: ${res.status}`);

  const json = await res.json();
  const html: string = json?.result?.html ?? "";
  if (!html) return [];

  const $ = cheerio.load(html);
  const results: AnimeSearchResult[] = [];

  $("a.aitem").each((_, el) => {
    const item = $(el);
    const titleEl = item.find("h6.title");
    const title = titleEl.text().trim();
    if (!title) return;

    const japaneseTitle = titleEl.attr("data-jp") ?? "";
    const poster = item.find(".poster img").attr("src") ?? "";
    const href = item.attr("href") ?? "";
    const slug = href.startsWith("/watch/") ? href.replace("/watch/", "") : href;

    let sub = "",
      dub = "",
      animeType = "",
      year = "",
      rating = "",
      totalEps = "";

    item.find(".info span").each((_, spanEl) => {
      const span = $(spanEl);
      const cls = span.attr("class") ?? "";
      if (cls.includes("sub")) {
        sub = span.text().trim();
      } else if (cls.includes("dub")) {
        dub = span.text().trim();
      } else if (cls.includes("rating")) {
        rating = span.text().trim();
      } else {
        const b = span.find("b");
        const text = span.text().trim();
        if (b.length && /^\d+$/.test(text)) {
          totalEps = text;
        } else if (b.length) {
          animeType = text;
        } else {
          year = text;
        }
      }
    });

    results.push({
      title,
      japaneseTitle,
      slug,
      url: `${BASE}${href}`,
      poster,
      subEpisodes: sub,
      dubEpisodes: dub,
      totalEpisodes: totalEps,
      year,
      type: animeType,
      rating,
    });
  });

  return results;
}

/**
 * Scrape anime detail page to get ani_id and metadata.
 */
export async function animekaiAnimeInfo(slug: string): Promise<AnimeInfo> {
  const url = `${BASE}/watch/${slug}`;
  const res = await fetchWithTimeout(url, { headers: BASE_HEADERS });
  if (!res.ok) throw new Error(`AnimeKAI info failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  let aniId = "";
  const syncScript = $("script#syncData").text();
  if (syncScript) {
    try {
      const parsed = JSON.parse(syncScript);
      aniId = parsed?.anime_id ?? "";
    } catch {
      // ignore parse error
    }
  }

  const infoEl = $(".main-entity .info");
  let sub = "",
    dub = "",
    atype = "";
  infoEl.find("span").each((_, spanEl) => {
    const span = $(spanEl);
    const cls = span.attr("class") ?? "";
    if (cls.includes("sub")) sub = span.text().trim();
    else if (cls.includes("dub")) dub = span.text().trim();
    else if (span.find("b").length) atype = span.text().trim();
  });

  const detail: Record<string, string | string[]> = {};
  $(".detail > div > div").each((_, divEl) => {
    const div = $(divEl);
    const text = div.text();
    if (!text.includes(":")) return;
    const [rawKey, ...rest] = text.split(":");
    const key = rawKey.trim().toLowerCase().replace(/\s+/g, "_");
    const links = div.find("span a");
    detail[key] =
      links.length > 0
        ? links
            .map((_, a) => $(a).text().trim())
            .get()
        : rest.join(":").trim();
  });

  const bgEl = $(".watch-section-bg");
  const bgStyle = bgEl.attr("style") ?? "";
  const bannerMatch = bgStyle.match(/url\(([^)]+)\)/);
  const banner = bannerMatch ? bannerMatch[1] : "";

  return {
    aniId,
    slug,
    title: $("h1.title").text().trim(),
    japaneseTitle: $("h1.title").attr("data-jp") ?? "",
    description: $(".desc").text().trim(),
    poster: $(".poster img[itemprop='image']").attr("src") ?? "",
    banner,
    subEpisodes: sub,
    dubEpisodes: dub,
    type: atype,
    malScore: $(".rate-box .value").text().trim(),
    detail,
  };
}

/**
 * Get episode list for an anime by ani_id.
 * Requires token encoding via enc-dec.app.
 */
export async function animekaiEpisodes(
  aniId: string,
): Promise<AnimeEpisode[]> {
  const encoded = await encodeToken(aniId);
  if (!encoded) throw new Error("AnimeKAI: token encoding failed for episodes");

  const url = new URL(EPISODES_URL);
  url.searchParams.set("ani_id", aniId);
  url.searchParams.set("_", encoded);

  const res = await fetchWithTimeout(url.toString(), { headers: AJAX_HEADERS });
  if (!res.ok) throw new Error(`AnimeKAI episodes failed: ${res.status}`);

  const json = await res.json();
  const html: string = json?.result ?? "";
  if (!html) return [];

  const $ = cheerio.load(html);
  const episodes: AnimeEpisode[] = [];

  $(".eplist a").each((_, el) => {
    const ep = $(el);
    const langs = ep.attr("langs") ?? "0";
    const langsNum = parseInt(langs, 10);

    episodes.push({
      number: ep.attr("num") ?? "",
      slug: ep.attr("slug") ?? "",
      title: ep.find("span").text().trim(),
      japaneseTitle: ep.find("span").attr("data-jp") ?? "",
      token: ep.attr("token") ?? "",
      hasSub: !isNaN(langsNum) ? Boolean(langsNum & 1) : false,
      hasDub: !isNaN(langsNum) ? Boolean(langsNum & 2) : false,
    });
  });

  return episodes;
}

/**
 * Get available streaming servers for an episode token.
 * lang "1" = sub, "2" = dub, "3" = both.
 */
export async function animekaiServers(
  epToken: string,
): Promise<AnimeServersResult> {
  const encoded = await encodeToken(epToken);
  if (!encoded) throw new Error("AnimeKAI: token encoding failed for servers");

  const url = new URL(SERVERS_URL);
  url.searchParams.set("token", epToken);
  url.searchParams.set("_", encoded);

  const res = await fetchWithTimeout(url.toString(), { headers: AJAX_HEADERS });
  if (!res.ok) throw new Error(`AnimeKAI servers failed: ${res.status}`);

  const json = await res.json();
  const html: string = json?.result ?? "";
  const $ = cheerio.load(html);

  const servers: Record<string, AnimeServer[]> = {};

  $(".server-items").each((_, groupEl) => {
    const group = $(groupEl);
    const lang = group.attr("data-id") ?? "unknown";
    servers[lang] = [];

    group.find(".server").each((_, srvEl) => {
      const srv = $(srvEl);
      servers[lang].push({
        name: srv.text().trim(),
        serverId: srv.attr("data-sid") ?? "",
        episodeId: srv.attr("data-eid") ?? "",
        linkId: srv.attr("data-lid") ?? "",
      });
    });
  });

  const watching = $(".server-note p").text().trim();

  return { servers, watching };
}

/**
 * Full source resolution pipeline:
 * encode → links/view → dec-kai → media endpoint → dec-mega → m3u8
 */
export async function animekaiSource(
  linkId: string,
): Promise<AnimeSourceResult> {
  // Step 1: Encode link_id
  const encoded = await encodeToken(linkId);
  if (!encoded) throw new Error("AnimeKAI: token encoding failed for source");

  // Step 2: Get encrypted result from links/view
  const url = new URL(LINKS_VIEW_URL);
  url.searchParams.set("id", linkId);
  url.searchParams.set("_", encoded);

  const viewRes = await fetchWithTimeout(url.toString(), {
    headers: AJAX_HEADERS,
  });
  if (!viewRes.ok) throw new Error(`AnimeKAI links/view failed: ${viewRes.status}`);

  const viewJson = await viewRes.json();
  const encryptedResult: string = viewJson?.result ?? "";
  if (!encryptedResult) throw new Error("AnimeKAI: empty encrypted result");

  // Step 3: dec-kai → embed URL
  const embedData = await decodeKai(encryptedResult);
  if (!embedData) throw new Error("AnimeKAI: dec-kai decryption failed");

  const embedUrl: string = embedData?.url ?? "";
  if (!embedUrl) throw new Error("AnimeKAI: no embed URL after dec-kai");

  // Step 4: Extract video_id and base from embed URL
  const videoId = embedUrl.replace(/\/$/, "").split("/").pop() ?? "";
  const embedBase = embedUrl.includes("/e/")
    ? embedUrl.split("/e/")[0]
    : embedUrl.replace(/\/[^/]+$/, "");

  // Step 5: Fetch encrypted media from embed server
  const mediaRes = await fetchWithTimeout(`${embedBase}/media/${videoId}`, {
    headers: BASE_HEADERS,
  });
  if (!mediaRes.ok)
    throw new Error(`AnimeKAI media endpoint failed: ${mediaRes.status}`);

  const mediaJson = await mediaRes.json();
  const encryptedMedia: string = mediaJson?.result ?? "";
  if (!encryptedMedia) throw new Error("AnimeKAI: empty encrypted media");

  // Step 6: dec-mega → final sources
  const finalData = await decodeMega(encryptedMedia);
  if (!finalData) throw new Error("AnimeKAI: dec-mega decryption failed");

  const sources: Array<{ file: string; type?: string }> = Array.isArray(
    finalData?.sources,
  )
    ? finalData.sources
    : [];

  // Pick the best/first HLS source
  const hlsSource =
    sources.find((s) => s.file?.includes(".m3u8")) ?? sources[0];
  const playlist = hlsSource?.file ?? "";

  const rawTracks: Array<any> = Array.isArray(finalData?.tracks)
    ? finalData.tracks
    : [];

  const tracks: AnimeSourceTrack[] = rawTracks
    .filter((t: any) => t?.file && t?.kind !== "thumbnails")
    .map((t: any) => ({
      file: t.file,
      label: t.label ?? "",
      kind: t.kind ?? "subtitles",
      default: Boolean(t.default),
    }));

  return {
    playlist,
    tracks,
    skip: embedData?.skip ?? {},
    download: finalData?.download ?? "",
    headers: {
      referer: `${embedBase}/`,
      origin: embedBase,
    },
  };
}
