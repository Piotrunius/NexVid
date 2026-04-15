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
  const directUrl = `${FEBBOX_BASE}/file/file_download?fid=${fid}&share_key=${encodeURIComponent(shareKey)}`;
  const url = `${FEBBOX_BASE}/console/video_quality_list?fid=${fid}`;
  const headers: Record<string, string> = {
    ...FEBBOX_HEADERS,
    referer: `${FEBBOX_BASE}/share/${shareKey}`,
  };
  const cookieHeader = buildFebboxCookieHeader(uiCookie);
  if (cookieHeader) headers.cookie = cookieHeader;

  let data: any;

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
      fallback,
    ];

    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (!value) continue;
      if (/^https?:\/\//i.test(value)) return value;
    }
    return "";
  };

  // Preferred: public share download endpoint (works without logged-in UI cookie)
  const parseDirectSubtitles = (directData: any): FebBoxSubtitle[] => {
    const fileEntry =
      Array.isArray(directData?.data) && directData.data.length > 0
        ? directData.data[0]
        : {};
    const rawCollections = [
      fileEntry?.subtitle_list,
      fileEntry?.subtitles,
      fileEntry?.sub_list,
      fileEntry?.srt_list,
      directData?.subtitle_list,
      directData?.subtitles,
    ];

    const items: any[] = [];
    for (const collection of rawCollections) {
      if (Array.isArray(collection)) items.push(...collection);
    }

    const guessLang = (value: string) => {
      const lowered = value.toLowerCase();
      if (lowered.includes("pol") || lowered.includes("pl")) return "pl";
      if (lowered.includes("spa") || lowered.includes("es")) return "es";
      if (lowered.includes("fre") || lowered.includes("fr")) return "fr";
      if (lowered.includes("ger") || lowered.includes("de")) return "de";
      if (lowered.includes("ita") || lowered.includes("it")) return "it";
      if (lowered.includes("por") || lowered.includes("pt")) return "pt";
      return "en";
    };

    const mapped = items
      .map((item) => {
        if (typeof item === "string") {
          const type = item.toLowerCase().includes(".vtt") ? "vtt" : "srt";
          return {
            url: item,
            language: guessLang(item),
            label: guessLang(item).toUpperCase(),
            type,
          } as FebBoxSubtitle;
        }

        const url =
          item?.url || item?.src || item?.download_url || item?.file_path || "";
        if (!url) return null;

        const language =
          item?.language ||
          item?.lang ||
          item?.locale ||
          guessLang(String(item?.label || item?.name || url));
        const label =
          item?.label || item?.name || String(language).toUpperCase();
        const type = String(url).toLowerCase().includes(".vtt") ? "vtt" : "srt";

        return {
          url,
          language: String(language).toLowerCase(),
          label: String(label),
          type,
        } as FebBoxSubtitle;
      })
      .filter((entry): entry is FebBoxSubtitle => Boolean(entry && entry.url));

    const unique = new Map<string, FebBoxSubtitle>();
    for (const subtitle of mapped) {
      if (!unique.has(subtitle.url)) unique.set(subtitle.url, subtitle);
    }
    return Array.from(unique.values());
  };

  const parseDirectAudioTracks = (directData: any): FebBoxAudioTrack[] => {
    const fileEntry =
      Array.isArray(directData?.data) && directData.data.length > 0
        ? directData.data[0]
        : {};
    const rawCollections = [
      fileEntry?.audio_list,
      fileEntry?.audio_tracks,
      fileEntry?.audios,
      fileEntry?.track_list,
      fileEntry?.multi_audio,
      directData?.audio_list,
      directData?.audio_tracks,
      directData?.audios,
    ];

    const guessLang = (value: string) => {
      const lowered = String(value || "").toLowerCase();
      if (lowered.includes("pol") || lowered.includes("pl")) return "pl";
      if (lowered.includes("eng") || lowered.includes("en")) return "en";
      if (lowered.includes("spa") || lowered.includes("es")) return "es";
      if (lowered.includes("fre") || lowered.includes("fr")) return "fr";
      if (lowered.includes("ger") || lowered.includes("de")) return "de";
      if (lowered.includes("ita") || lowered.includes("it")) return "it";
      if (lowered.includes("por") || lowered.includes("pt")) return "pt";
      if (lowered.includes("jpn") || lowered.includes("ja")) return "ja";
      if (lowered.includes("kor") || lowered.includes("ko")) return "ko";
      return "unknown";
    };

    const items: any[] = [];
    for (const collection of rawCollections) {
      if (Array.isArray(collection)) items.push(...collection);
    }

    const mapped = items
      .map((item, index) => {
        if (typeof item === "string") {
          const lang = guessLang(item);
          return {
            id: index,
            name:
              lang !== "unknown" ? lang.toUpperCase() : `Track ${index + 1}`,
            lang,
            isDefault: index === 0,
            url: item,
          } as FebBoxAudioTrack;
        }

        if (!item || typeof item !== "object") return null;

        const url =
          item?.url ||
          item?.src ||
          item?.download_url ||
          item?.file_path ||
          undefined;
        const lang = String(
          item?.language ||
            item?.lang ||
            item?.locale ||
            item?.code ||
            guessLang(item?.name || item?.label || ""),
        ).toLowerCase();
        const name = String(
          item?.label ||
            item?.name ||
            item?.title ||
            (lang !== "unknown" ? lang.toUpperCase() : `Track ${index + 1}`),
        );
        const id = Number.isFinite(Number(item?.id)) ? Number(item.id) : index;

        return {
          id,
          name,
          lang,
          isDefault: Boolean(
            item?.default || item?.is_default || item?.enabled || index === 0,
          ),
          url,
        } as FebBoxAudioTrack;
      })
      .filter((entry): entry is FebBoxAudioTrack => Boolean(entry));

    if (mapped.length === 0) return [];

    const unique = new Map<string, FebBoxAudioTrack>();
    for (const track of mapped) {
      const key = track.url || `${track.lang}:${track.name}`;
      if (!unique.has(key)) unique.set(key, track);
    }

    const deduped = Array.from(unique.values()).map((track, index) => ({
      ...track,
      id: index,
      isDefault: track.isDefault || index === 0,
    }));

    return deduped;
  };

  const parseDirectLinks = (
    directData: any,
  ): {
    qualities: FebBoxQuality[];
    subtitles: FebBoxSubtitle[];
    audioTracks: FebBoxAudioTrack[];
  } => {
    if (
      !(
        directData?.code === 1 &&
        Array.isArray(directData?.data) &&
        directData.data.length > 0
      )
    ) {
      return { qualities: [], subtitles: [], audioTracks: [] };
    }

    const fileEntry = directData.data[0] || {};
    const qualityList = Array.isArray(fileEntry.quality_list)
      ? fileEntry.quality_list
      : [];
    const subtitles = parseDirectSubtitles(directData);
    const audioTracks = parseDirectAudioTracks(directData);

    const mapped = qualityList
      .map((q: any) => {
        const url = pickQualityUrl(q, String(fileEntry?.download_url || ""));
        const quality = String(q?.quality || q?.label || q?.name || "ORG");
        const format = String(
          q?.format ||
            q?.ext ||
            q?.type ||
            q?.mime_type ||
            inferFormatFromUrl(url),
        );
        const mime = String(q?.mime || q?.mime_type || "");

        return {
          url,
          quality,
          name: String(q?.name || q?.label || quality || "Original"),
          label: String(q?.label || q?.name || quality || "Original"),
          size: q?.file_size ? `${q.file_size}` : "",
          format,
          mime,
          type: String(q?.type || ""),
        };
      })
      .filter((q: FebBoxQuality) => Boolean(q.url));

    if (mapped.length > 0) return { qualities: mapped, subtitles, audioTracks };

    if (fileEntry?.download_url) {
      const fallbackUrl = String(fileEntry.download_url);
      return {
        qualities: [
          {
            url: fallbackUrl,
            quality: "ORG",
            name: "Original",
            label: "Original",
            size: fileEntry?.file_size ? `${fileEntry.file_size}` : "",
            format: inferFormatFromUrl(fallbackUrl),
            mime: "",
            type: "",
          },
        ],
        subtitles,
        audioTracks,
      };
    }

    return { qualities: [], subtitles: [], audioTracks: [] };
  };

  try {
    const response = await fetch(directUrl, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const directData = await response.json();
    const parsed = parseDirectLinks(directData);
    if (parsed.qualities.length > 0) return parsed;
  } catch {
    // fallback below
  }

  // Fallback: HTML quality list endpoint
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch {
    throw new Error("FebBox links fetch failed");
  }

  const html: string = data?.html || data?.data?.html || "";

  if (!html) {
    // Try alternate JSON structure
    if (data?.data?.list && Array.isArray(data.data.list)) {
      return {
        qualities: data.data.list.map((item: any) => ({
          url: item.url || item.play_url || item.download_url || "",
          quality: item.quality || item.resolution || item.label || "unknown",
          name: item.name || item.label || item.quality || "unknown",
          label: item.label || item.name || item.quality || "unknown",
          size: item.size || "",
          format:
            item.format ||
            item.ext ||
            item.type ||
            inferFormatFromUrl(
              item.url || item.play_url || item.download_url || "",
            ),
          mime: item.mime || item.mime_type || "",
          type: item.type || "",
        })),
        subtitles: [],
        audioTracks: [],
      };
    }
    return { qualities: [], subtitles: [], audioTracks: [] };
  }

  const results: FebBoxQuality[] = [];

  // Primary regex
  const regex =
    /class="file_quality"[^>]*data-url="([^"]*)"[^>]*data-quality="([^"]*)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const chunk = html.substring(match.index, match.index + 500);
    const nameMatch = chunk.match(/class="name"[^>]*>([^<]*)</);
    const sizeMatch = chunk.match(/class="size"[^>]*>([^<]*)</);
    results.push({
      url: match[1],
      quality: match[2],
      name: nameMatch?.[1]?.trim() || match[2],
      size: sizeMatch?.[1]?.trim() || "",
      label: nameMatch?.[1]?.trim() || match[2],
      format: inferFormatFromUrl(match[1]),
      mime: "",
      type: "",
    });
  }

  // Fallback regex
  if (results.length === 0) {
    const regex2 = /data-url="([^"]+)"[^>]*data-quality="([^"]+)"/g;
    let m2;
    while ((m2 = regex2.exec(html)) !== null) {
      results.push({
        url: m2[1],
        quality: m2[2],
        name: m2[2],
        label: m2[2],
        size: "",
        format: inferFormatFromUrl(m2[1]),
        mime: "",
        type: "",
      });
    }
  }

  // Last resort: plain link extraction
  if (results.length === 0) {
    const linkRegex = /href="(https?:\/\/[^"]+\.(mp4|mkv|m3u8)[^"]*)"/g;
    let m3;
    while ((m3 = linkRegex.exec(html)) !== null) {
      results.push({
        url: m3[1],
        quality: "unknown",
        name: "Stream",
        label: "Stream",
        size: "",
        format: inferFormatFromUrl(m3[1]),
        mime: "",
        type: "",
      });
    }
  }

  return { qualities: results, subtitles: [], audioTracks: [] };
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
