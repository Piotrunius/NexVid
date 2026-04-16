/* ============================================
   Showbox + FebBox API Client
   Based on: github.com/badwinton/show_feb_box_api
   Server-side only (used in API routes)
   ============================================ */

import CryptoJS from "crypto-js";

// ---- Configuration ----

const SB_CONFIG = {
  BASE_URL: "https://mbpapi.shegu.net/api/api_client/index/",
  APP_KEY: "moviebox",
  APP_ID: "com.tdo.showbox",
  IV: "wEiphTn!",
  KEY: "123d6cedf626dy54233aa1w6",
  DEFAULTS: {
    CHILD_MODE: "0",
    APP_VERSION: "11.5",
    LANG: "en",
    PLATFORM: "android",
    CHANNEL: "Website",
    APPID: "27",
    VERSION: "129",
    MEDIUM: "Website",
  },
};

const FEBBOX_BASE = "https://www.febbox.com";
const FEBBOX_HEADERS = {
  "x-requested-with": "XMLHttpRequest",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

// Share-link base domains to try (some go down intermittently)
const SHARE_LINK_HOSTS = [
  "https://www.showbox.media",
  "https://showbox.media",
  "https://www.boxmovie.media",
  "https://boxmovie.media",
  "https://showbox.run",
  "https://www.showbox.run",
];

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let r = "";
  for (let i = 0; i < len; i++)
    r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function toBase64Utf8(value: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(value)));
  }

  let binary = "";
  const bytes = new TextEncoder().encode(value);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---- Showbox Encryption ----

function encrypt(data: string): string {
  return CryptoJS.TripleDES.encrypt(
    data,
    CryptoJS.enc.Utf8.parse(SB_CONFIG.KEY),
    { iv: CryptoJS.enc.Utf8.parse(SB_CONFIG.IV) },
  ).toString();
}

function generateVerify(encryptedData: string): string {
  return CryptoJS.MD5(
    CryptoJS.MD5(SB_CONFIG.APP_KEY).toString() + SB_CONFIG.KEY + encryptedData,
  ).toString();
}

function getExpiryTimestamp(): number {
  return Math.floor(Date.now() / 1000 + 60 * 60 * 12);
}

// ---- Showbox API ----

async function showboxRequest(
  module: string,
  params: Record<string, any> = {},
): Promise<any> {
  const requestData = {
    ...SB_CONFIG.DEFAULTS,
    expired_date: getExpiryTimestamp(),
    module,
    ...params,
  };

  const encryptedData = encrypt(JSON.stringify(requestData));
  const body = JSON.stringify({
    app_key: CryptoJS.MD5(SB_CONFIG.APP_KEY).toString(),
    verify: generateVerify(encryptedData),
    encrypt_data: encryptedData,
  });

  const formData = new URLSearchParams({
    data: toBase64Utf8(body),
    appid: SB_CONFIG.DEFAULTS.APPID,
    platform: SB_CONFIG.DEFAULTS.PLATFORM,
    version: SB_CONFIG.DEFAULTS.VERSION,
    medium: SB_CONFIG.DEFAULTS.MEDIUM,
  });

  const nonce = randomHex(32);

  const response = await fetch(SB_CONFIG.BASE_URL, {
    method: "POST",
    headers: {
      Platform: SB_CONFIG.DEFAULTS.PLATFORM,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "okhttp/3.2.0",
    },
    body: `${formData.toString()}&token${nonce}`,
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok)
    throw new Error(`Showbox API ${module}: HTTP ${response.status}`);
  return response.json();
}

export async function searchShowbox(
  title: string,
  type: "movie" | "tv" = "movie",
  page = 1,
): Promise<any[]> {
  const data = await showboxRequest("Search5", {
    page,
    type: type === "movie" ? "movie" : "tv",
    keyword: title,
    pagelimit: 20,
  });
  return data?.data || [];
}

export async function getShowboxMovieDetails(movieId: number): Promise<any> {
  const data = await showboxRequest("Movie_detail", { mid: movieId });
  return data?.data;
}

export async function getShowboxShowDetails(showId: number): Promise<any> {
  const data = await showboxRequest("TV_detail_v2", { tid: showId });
  return data?.data;
}

export async function getFebBoxShareKey(
  showboxId: number,
  type: 1 | 2,
): Promise<string | null> {
  const errors: string[] = [];
  for (const host of SHARE_LINK_HOSTS) {
    try {
      const url = `${host}/index/share_link?id=${showboxId}&type=${type}`;
      const response = await fetch(url, {
        headers: { "User-Agent": "okhttp/3.2.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        errors.push(`${host}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const link = data?.data?.link;
      if (link) return link.split("/").pop() || null;
      errors.push(`${host}: no link in response`);
    } catch (err: any) {
      errors.push(`${host}: ${err.message}`);
    }
  }
  console.error("[showbox] getFebBoxShareKey failed:", errors.join("; "));
  return null;
}

// ---- FebBox OAuth API (official) ----

export interface FebBoxTokenResponse {
  code: number;
  msg: string;
  data?: {
    access_token: string;
    expires_in: number;
    token_type: string;
    refresh_token: string;
  };
}

export async function getFebBoxToken(
  clientId: string,
  clientSecret: string,
): Promise<FebBoxTokenResponse> {
  try {
    const res = await fetch(`${FEBBOX_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("json")) {
      return {
        code: 0,
        msg: `FebBox OAuth: HTTP ${res.status} (${ct.split(";")[0] || "non-json"})`,
      };
    }
    return await res.json();
  } catch (err: any) {
    return { code: 0, msg: `FebBox OAuth: ${err.message}` };
  }
}

// ---- FebBox Web Share API ----

export interface FebBoxFile {
  fid: number;
  file_name: string;
  file_size: number;
  is_dir: 0 | 1;
  oss_fid?: number;
}

export interface FebBoxQuality {
  url: string;
  quality: string;
  name: string;
  size: string;
  format?: string;
  mime?: string;
  type?: string;
  label?: string;
  headers?: Record<string, string>;
}

export interface FebBoxSubtitle {
  url: string;
  language: string;
  label: string;
  type: "srt" | "vtt";
}

export interface FebBoxAudioTrack {
  id: number;
  name: string;
  lang: string;
  isDefault: boolean;
  url?: string;
}

function buildFebboxCookieHeader(rawCookie?: string): string | undefined {
  const value = (rawCookie || "").trim();
  if (!value) return undefined;

  if (value.includes("=")) {
    if (value.toLowerCase().startsWith("cookie:")) {
      return value.slice(7).trim();
    }
    return value;
  }

  return `ui=${value}`;
}

function readSetCookieHeaders(response: Response): string[] {
  const anyHeaders = response.headers as any;
  if (typeof anyHeaders?.getSetCookie === "function") {
    const values = anyHeaders.getSetCookie();
    if (Array.isArray(values) && values.length > 0) return values;
  }

  const single = response.headers.get("set-cookie");
  if (!single) return [];
  return [single];
}

function mergeCookieParts(
  ...cookieValues: Array<string | undefined>
): string | undefined {
  const parts = cookieValues
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim().replace(/;+$/, ""));

  if (parts.length === 0) return undefined;

  const unique = new Map<string, string>();
  for (const part of parts.join("; ").split(";")) {
    const trimmed = part.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const [name, ...rest] = trimmed.split("=");
    if (!name) continue;
    unique.set(name.trim(), `${name.trim()}=${rest.join("=").trim()}`);
  }

  if (unique.size === 0) return undefined;
  return Array.from(unique.values()).join("; ");
}

async function getFebboxShareSessionCookie(
  shareKey: string,
  uiCookie?: string,
): Promise<string | undefined> {
  const baseCookie = buildFebboxCookieHeader(uiCookie);
  const shareUrl = `${FEBBOX_BASE}/share/${shareKey}`;
  const requestHeaders = {
    "user-agent": FEBBOX_HEADERS["user-agent"],
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  try {
    const response = await fetch(shareUrl, {
      headers: requestHeaders,
      signal: AbortSignal.timeout(10000),
    });

    const setCookies = readSetCookieHeaders(response);
    const phpSess = setCookies
      .map((value) => value.match(/(?:^|\s|,)PHPSESSID=([^;\s,]+)/i)?.[1])
      .find(Boolean);

    if (!phpSess) return baseCookie;
    return mergeCookieParts(baseCookie, `PHPSESSID=${phpSess}`);
  } catch {
    return baseCookie;
  }
}

export async function febboxGetFileList(
  shareKey: string,
  parentId = 0,
  uiCookie?: string,
): Promise<FebBoxFile[]> {
  const url = `${FEBBOX_BASE}/file/file_share_list?share_key=${shareKey}&pwd=&parent_id=${parentId}&is_html=0`;
  const headers: Record<string, string> = {
    ...FEBBOX_HEADERS,
    referer: `${FEBBOX_BASE}/share/${shareKey}`,
  };
  const cookieHeader = buildFebboxCookieHeader(uiCookie);
  if (cookieHeader) headers.cookie = cookieHeader;

  let data: any;
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch {
    throw new Error("FebBox file list fetch failed");
  }

  return data?.data?.file_list || [];
}

export async function febboxGetLinks(
  shareKey: string,
  fid: number,
  uiCookie?: string,
): Promise<{
  qualities: FebBoxQuality[];
  subtitles: FebBoxSubtitle[];
  audioTracks: FebBoxAudioTrack[];
}> {
  const headers: Record<string, string> = {
    ...FEBBOX_HEADERS,
    referer: `${FEBBOX_BASE}/share/${shareKey}`,
  };
  const cookieHeader = buildFebboxCookieHeader(uiCookie);
  if (cookieHeader) headers.cookie = cookieHeader;

  // Helpers
  const inferFormatFromUrl = (rawUrl: string): string => {
    const url = String(rawUrl || "").toLowerCase();
    if (!url) return "";
    if (url.includes(".m3u8")) return "hls";
    if (url.includes(".mp4")) return "mp4";
    if (url.includes(".mkv")) return "mkv";
    return "";
  };

  const pickQualityUrl = (item: any, fallback: string): string => {
    const candidates = [
      item?.hls_url,
      item?.play_url,
      item?.stream_url,
      item?.url,
      item?.download_url,
      item?.file_url,
      item?.src,
    ];
    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (!value) continue;
      if (/^https?:\/\//i.test(value) && value.toLowerCase().includes(".m3u8")) return value;
    }
    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (!value) continue;
      if (/^https?:\/\//i.test(value)) return value;
    }
    return String(fallback || "").trim();
  };

  const fetchJson = async (url: string) => {
    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return null;
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch {
        return { html: text }; // Treat as HTML if JSON fails
      }
    } catch {
      return null;
    }
  };

  const parseDirectSubtitles = (directData: any): FebBoxSubtitle[] => {
    const fileEntry = Array.isArray(directData?.data) ? directData.data[0] : (directData?.data || {});
    const items = [...(Array.isArray(fileEntry?.subtitle_list) ? fileEntry.subtitle_list : []), ...(Array.isArray(directData?.subtitle_list) ? directData.subtitle_list : [])];
    const guessLang = (v: string) => {
      const l = v.toLowerCase();
      if (l.includes("pol") || l.includes("pl")) return "pl";
      if (l.includes("spa") || l.includes("es")) return "es";
      return "en";
    };
    return items.map(item => {
      const u = typeof item === "string" ? item : (item?.url || item?.src || "");
      if (!u) return null;
      return { url: u, language: guessLang(u), label: guessLang(u).toUpperCase(), type: u.toLowerCase().includes(".vtt") ? "vtt" : "srt" } as FebBoxSubtitle;
    }).filter((s): s is FebBoxSubtitle => !!s);
  };

  const parseDirectAudioTracks = (directData: any): FebBoxAudioTrack[] => {
    const fileEntry = Array.isArray(directData?.data) ? directData.data[0] : (directData?.data || {});
    const items = [...(Array.isArray(fileEntry?.audio_list) ? fileEntry.audio_list : []), ...(Array.isArray(directData?.audio_list) ? directData.audio_list : [])];
    return items.map((item, index) => {
      const u = typeof item === "string" ? item : (item?.url || item?.src || "");
      const lang = String(item?.lang || "en");
      return { id: index, name: lang.toUpperCase(), lang, isDefault: index === 0, url: u } as FebBoxAudioTrack;
    });
  };

  const parseLinks = (data: any) => {
    const fileEntry = Array.isArray(data?.data) ? data.data[0] : (data?.data || data || {});
    const rawList = fileEntry.quality_list || fileEntry.transcode_list || data.list || data.data?.list || {};
    const items = Array.isArray(rawList) ? rawList : Object.values(rawList);
    
    const qualities = items.map((q: any) => {
      const u = pickQualityUrl(q, String(fileEntry?.download_url || ""));
      if (!u) return null;
      
      const res: FebBoxQuality = {
        url: u,
        quality: String(q?.quality || q?.label || "ORG"),
        name: String(q?.label || q?.name || "Original"),
        label: String(q?.label || q?.name || "Original"),
        size: q?.file_size ? `${q.file_size}` : "",
        format: inferFormatFromUrl(u),
      };

      // Inject required referer for HLS links
      if (u.toLowerCase().includes(".m3u8")) {
        res.headers = { referer: "https://www.febbox.com/" };
      }

      return res;
    }).filter((q): q is FebBoxQuality => !!q);

    return { qualities, subtitles: parseDirectSubtitles(data), audioTracks: parseDirectAudioTracks(data) };
  };

  let allQualities: FebBoxQuality[] = [];
  let allSubtitles: FebBoxSubtitle[] = [];
  let allAudioTracks: FebBoxAudioTrack[] = [];

  // 1. Try file_download (Direct)
  const d1 = await fetchJson(`${FEBBOX_BASE}/file/file_download?fid=${fid}&share_key=${encodeURIComponent(shareKey)}&is_hls=1&is_html=0`);
  if (d1) {
    const p = parseLinks(d1);
    allQualities.push(...p.qualities);
    allSubtitles.push(...p.subtitles);
    allAudioTracks.push(...p.audioTracks);
    if (d1.data?.[0]?.download_url) {
      const u = d1.data[0].download_url;
      if (!allQualities.find(q => q.url === u)) {
        const quality: FebBoxQuality = { 
          url: u, 
          quality: "ORG", 
          name: "Original", 
          label: "Original", 
          size: d1.data[0].file_size || "", 
          format: inferFormatFromUrl(u) 
        };
        if (u.toLowerCase().includes(".m3u8")) {
          quality.headers = { referer: "https://www.febbox.com/" };
        }
        allQualities.push(quality);
      }
    }
  }

  // 2. Try video_quality_list (Quality Console)
  const d2 = await fetchJson(`${FEBBOX_BASE}/console/video_quality_list?fid=${fid}&share_id=${shareKey}&is_hls=1&is_html=0`);
  if (d2) {
    if (d2.html) {
      const regex = /class="file_quality"[^>]*data-url="([^"]*)"[^>]*data-quality="([^"]*)"/g;
      let m;
      while ((m = regex.exec(d2.html)) !== null) {
        if (!allQualities.find(q => q.url === m![1])) {
          const quality: FebBoxQuality = { 
            url: m[1], 
            quality: m[2], 
            name: m[2], 
            label: m[2], 
            size: "", 
            format: inferFormatFromUrl(m[1]) 
          };
          if (m[1].toLowerCase().includes(".m3u8")) {
            quality.headers = { referer: "https://www.febbox.com/" };
          }
          allQualities.push(quality);
        }
      }
    } else {
      const p = parseLinks(d2);
      p.qualities.forEach(q => { if (!allQualities.find(aq => aq.url === q.url)) allQualities.push(q); });
    }
  }

  // 3. Try hls_playlist (Dedicated HLS)
  const d3 = await fetchJson(`${FEBBOX_BASE}/file/hls_playlist?fid=${fid}&share_key=${shareKey}`);
  if (d3 && !d3.html) {
    const p = parseLinks(d3);
    p.qualities.forEach(q => { if (!allQualities.find(aq => aq.url === q.url)) allQualities.push(q); });
  }

  // Final Merge & Priority
  allQualities.sort((a, b) => {
    const aH = a.url.toLowerCase().includes(".m3u8");
    const bH = b.url.toLowerCase().includes(".m3u8");
    if (aH && !bH) return -1;
    if (!aH && bH) return 1;
    return 0;
  });

  return { qualities: allQualities, subtitles: allSubtitles, audioTracks: allAudioTracks };
}

export interface ResolvedStream {
  qualities: { url: string; quality: string; label: string; size: string }[];
  subtitles: {
    url: string;
    language: string;
    label: string;
    type: "srt" | "vtt";
  }[];
  audioTracks: {
    id: number;
    name: string;
    lang: string;
    isDefault: boolean;
    url?: string;
  }[];
  shareKey: string;
  fileName?: string;
}

export interface ResolveLog {
  step: string;
  status: "ok" | "fail";
  detail?: string;
}

export async function resolveStream(options: {
  title: string;
  tmdbId: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
  uiCookie?: string;
}): Promise<{ stream: ResolvedStream | null; logs: ResolveLog[] }> {
  const { title, type, season, episode, uiCookie } = options;
  const logs: ResolveLog[] = [];

  // Step 1: Search Showbox
  let results: any[];
  try {
    const searchType = type === "movie" ? "movie" : "tv";
    results = await searchShowbox(title, searchType);
    if (!results || results.length === 0) {
      logs.push({
        step: "search",
        status: "fail",
        detail: `No results for "${title}"`,
      });
      return { stream: null, logs };
    }
    logs.push({
      step: "search",
      status: "ok",
      detail: `${results.length} results`,
    });
  } catch (err: any) {
    logs.push({ step: "search", status: "fail", detail: err.message });
    return { stream: null, logs };
  }

  // Step 2: Match title
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const bestMatch =
    results.find((r: any) => {
      const rTitle = (r.title || r.name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return rTitle === normalizedTitle;
    }) || results[0];

  const showboxId = bestMatch.id;
  const boxType = type === "movie" ? 1 : 2;
  logs.push({
    step: "match",
    status: "ok",
    detail: `id=${showboxId} "${bestMatch.title || bestMatch.name}"`,
  });

  // Step 3: Get FebBox share key
  let shareKey: string | null;
  try {
    shareKey = await getFebBoxShareKey(showboxId, boxType as 1 | 2);
    if (!shareKey) {
      logs.push({
        step: "shareKey",
        status: "fail",
        detail: "All share-link hosts failed",
      });
      return { stream: null, logs };
    }
    logs.push({ step: "shareKey", status: "ok", detail: shareKey });
  } catch (err: any) {
    logs.push({ step: "shareKey", status: "fail", detail: err.message });
    return { stream: null, logs };
  }

  // Step 4: Get file list
  let files: FebBoxFile[];
  let shareSessionCookie: string | undefined;
  try {
    shareSessionCookie = await getFebboxShareSessionCookie(shareKey, uiCookie);
    files = await febboxGetFileList(shareKey, 0, shareSessionCookie);
    if (!files || files.length === 0) {
      logs.push({
        step: "fileList",
        status: "fail",
        detail: "Empty file list",
      });
      return { stream: null, logs };
    }
    logs.push({
      step: "fileList",
      status: "ok",
      detail: `${files.length} files`,
    });
  } catch (err: any) {
    logs.push({ step: "fileList", status: "fail", detail: err.message });
    return { stream: null, logs };
  }

  // Step 5: Navigate to target file
  let targetFile: FebBoxFile | undefined;
  try {
    if (type === "movie") {
      targetFile = files
        .filter((f) => !f.is_dir)
        .sort((a, b) => b.file_size - a.file_size)[0];
    } else {
      const seasonNum = season || 1;
      const episodeNum = episode || 1;

      const seasonDir = files.find((f) => {
        if (!f.is_dir) return false;
        const name = f.file_name.toLowerCase();
        return (
          name.includes(`season ${seasonNum}`) ||
          name.includes(`s${String(seasonNum).padStart(2, "0")}`) ||
          name.includes(`season${seasonNum}`) ||
          name === `s${seasonNum}`
        );
      });

      if (seasonDir) {
        files = await febboxGetFileList(
          shareKey,
          seasonDir.fid,
          shareSessionCookie,
        );
        logs.push({
          step: "seasonNav",
          status: "ok",
          detail: seasonDir.file_name,
        });
      }

      const epPad = String(episodeNum).padStart(2, "0");
      targetFile = files.find((f) => {
        if (f.is_dir) return false;
        const name = f.file_name.toLowerCase();
        return (
          name.includes(`e${epPad}`) ||
          name.includes(`episode ${episodeNum}`) ||
          name.includes(`episode${episodeNum}`) ||
          name.includes(`ep${epPad}`) ||
          name.includes(`.e${epPad}.`)
        );
      });

      if (!targetFile) {
        const videoFiles = files
          .filter((f) => !f.is_dir)
          .sort((a, b) => a.file_name.localeCompare(b.file_name));
        targetFile = videoFiles[episodeNum - 1] || videoFiles[0];
      }
    }

    if (!targetFile) {
      logs.push({
        step: "findFile",
        status: "fail",
        detail: "No target file found",
      });
      return { stream: null, logs };
    }
    logs.push({
      step: "findFile",
      status: "ok",
      detail: `${targetFile.file_name} (fid=${targetFile.fid})`,
    });
  } catch (err: any) {
    logs.push({ step: "findFile", status: "fail", detail: err.message });
    return { stream: null, logs };
  }

  // Step 6: Get video links
  try {
    const linkData = await febboxGetLinks(
      shareKey,
      targetFile.fid,
      shareSessionCookie,
    );
    const links = linkData.qualities;
    if (!links || links.length === 0) {
      logs.push({
        step: "getLinks",
        status: "fail",
        detail: "No qualities extracted",
      });
      return { stream: null, logs };
    }
    logs.push({
      step: "getLinks",
      status: "ok",
      detail: `${links.length} qualities, ${linkData.subtitles.length} subtitles, ${linkData.audioTracks.length} audio tracks`,
    });

    return {
      stream: {
        qualities: links.map((l) => ({
          url: l.url,
          quality: l.quality,
          label: l.name || l.quality,
          size: l.size,
        })),
        subtitles: linkData.subtitles,
        audioTracks: linkData.audioTracks,
        shareKey,
        fileName: targetFile.file_name,
      },
      logs,
    };
  } catch (err: any) {
    logs.push({ step: "getLinks", status: "fail", detail: err.message });
    return { stream: null, logs };
  }
}
