/* ============================================
   VidSrc Bypass Helpers (vidlink.pro)
   Edge-runtime compatible implementation
   ============================================ */

import type { Caption } from '@/types';

const API_BASE = 'https://vidlink.pro/api/b';
const KEY_HEX = '2de6e6ea13a9df9503b11a6117fd7e51941e04a0c223dfeacfe8a1dbb6c52783';
const IV_LENGTH = 16;

export type VidSrcBypassParams =
  | { type: 'movie'; id: string; imdbId?: string }
  | { type: 'tv'; id: string; season: number; episode: number; imdbId?: string };

export type VidSrcEndpointId =
  | 'vidlinkpro'
  | 'vidsrcrip'
  | 'embedsu'
  | 'vidsrcicu'
  | 'vidlink'
  | 'vidsrc'
  | 'vidsrcpro'
  | 'vidsrcvip'
  | 'vidsrccc'
  | 'videasy'
  | 'vixsrc'
  | '111movies'
  | '2embedcc'
  | 'aoneroom'
  | 'idflix'
  | 'uniquestream'
  | 'tomautoembed'
  | 'ymovies'
  | 'yesmovies'
  | 'ridomovie'
  | 'primewire'
  | 'fmovies';

export interface VidSrcBypassVideoPayload {
  sourceID?: string;
  stream?: {
    id?: string;
    type?: string;
    playlist?: string;
    captions?: Array<{ id?: string; url?: string; language?: string; label?: string; type?: string; hasCorsRestrictions?: boolean }>;
    qualities?: Record<string, { url?: string }>;
    headers?: Record<string, string>;
  };
}

export interface ResolvedVidSrcResult {
  kind: 'hls' | 'file' | 'embed' | null;
  url?: string;
  playlist?: string;
  qualities?: Record<string, { url: string }>;
  subtitles: Caption[];
  headers: Record<string, string>;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!normalized || normalized.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToUtf8(bytes: ArrayBuffer): string {
  return new TextDecoder().decode(bytes);
}

function utf8ToBase64(value: string): string {
  const bytes = utf8ToBytes(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytesToUtf8(bytes.buffer);
}

function buildDefaultHeaders(): Record<string, string> {
  return {
    referer: 'https://vidlink.pro/',
    origin: 'https://vidlink.pro',
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  };
}

function buildHeadersForOrigin(origin: string): Record<string, string> {
  const normalized = origin.endsWith('/') ? origin : `${origin}/`;
  return {
    referer: normalized,
    origin: origin.replace(/\/$/, ''),
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  };
}

function looksLikeHtml(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html') || normalized.includes('<head');
}

function normalizePossibleUrl(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `https:${trimmed}`;
  return trimmed;
}

function extractPlayerIframeUrl(html: string): string {
  const direct = html.match(/id=["']player_iframe["'][^>]*src=["']([^"']+)/i)?.[1]
    || html.match(/src=["']([^"']+)["'][^>]*id=["']player_iframe/i)?.[1]
    || '';

  if (direct) return normalizePossibleUrl(direct);

  const fallbackIframe = html.match(/<iframe[^>]*src=["']([^"']+)/i)?.[1] || '';
  return normalizePossibleUrl(fallbackIframe);
}

function extractEncryptedPayload(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    throw new Error('Empty payload from vidlink.pro');
  }

  if (looksLikeHtml(trimmed)) {
    throw new Error('vidlink.pro returned HTML challenge page');
  }

  if (trimmed.includes(':')) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string' && parsed.includes(':')) {
      return parsed;
    }
  } catch {
    // not json payload
  }

  try {
    const decoded = base64ToUtf8(trimmed).trim();
    if (decoded.includes(':')) {
      return decoded;
    }
  } catch {
    // not base64 payload
  }

  throw new Error('Invalid encrypted payload from vidlink.pro');
}

function parseVidSrcRipConfig(configString: string): Record<string, any> {
  const content = configString.slice(1, -1).trim();
  const config: Record<string, any> = {};
  const regex = /(\w+):\s*(?:'([^']*)'|"([^"]*)"|(\[[^\]]*\])|([^,}]+))/g;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(content)) !== null) {
    const [, key, singleQuoted, doubleQuoted, arrayValue, unquotedValue] = match;
    let value: string | string[] = singleQuoted || doubleQuoted || unquotedValue;

    if (arrayValue) {
      try {
        value = JSON.parse(arrayValue) as string[];
      } catch {
        value = [];
      }
    }

    if (key === 'servers' && typeof value === 'string') {
      value = [value];
    }

    config[key] = value;
  }

  return config;
}

function xorEncryptDecrypt(key: string, message: string): string {
  const keyCodes = Array.from(key, (char) => char.charCodeAt(0));
  const messageCodes = Array.from(message, (char) => char.charCodeAt(0));
  const result: number[] = [];

  for (let i = 0; i < messageCodes.length; i += 1) {
    result.push(messageCodes[i] ^ keyCodes[i % keyCodes.length]);
  }

  return String.fromCharCode(...result);
}

function generateVidSrcRipVrf(key: string, encodedMessage: string): string {
  const decodedMessage = decodeURIComponent(encodedMessage);
  const xorResult = xorEncryptDecrypt(key, decodedMessage);
  return encodeURIComponent(utf8ToBase64(xorResult));
}

function parseEmbedSuServerHash(rawHash: string): string | null {
  try {
    const firstDecode = atob(rawHash)
      .split('.')
      .map((item) => item.split('').reverse().join(''));

    const secondDecodeRaw = atob(firstDecode.join('').split('').reverse().join(''));
    const secondDecode = JSON.parse(secondDecodeRaw) as Array<{ hash?: string }>;
    const firstServer = Array.isArray(secondDecode) ? secondDecode[0] : null;
    const hash = String(firstServer?.hash || '').trim();
    return hash || null;
  } catch {
    return null;
  }
}

async function importAesKey(): Promise<CryptoKey> {
  const keyBytes = hexToBytes(KEY_HEX).slice(0, 32);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
}

async function encryptId(id: string): Promise<string> {
  const key = await importAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const idBytes = utf8ToBytes(id);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    key,
    idBytes as BufferSource,
  );

  const value = `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
  return utf8ToBase64(value);
}

async function decryptClearKey(payload: string): Promise<string> {
  const [ivHex, encryptedHex] = String(payload || '').trim().split(':');
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid encrypted payload from vidlink.pro');
  }

  const key = await importAesKey();
  const iv = hexToBytes(ivHex);
  const encryptedBytes = hexToBytes(encryptedHex);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    key,
    encryptedBytes as BufferSource,
  );

  return bytesToUtf8(decrypted);
}

function normalizeCaptions(captions: unknown): Caption[] {
  if (!Array.isArray(captions)) return [];

  return captions
    .map((caption, index) => {
      const entry = caption as Record<string, unknown>;
      const url = String(entry?.url || '').trim();
      if (!url) return null;

      const language = String(entry?.language || 'en').toLowerCase();
      const rawType = String(entry?.type || '').toLowerCase();

      return {
        id: String(entry?.id || `vidsrc-${language}-${index}`),
        url,
        language,
        type: rawType.includes('vtt') ? 'vtt' : 'srt',
        hasCorsRestrictions: Boolean(entry?.hasCorsRestrictions),
      } as Caption;
    })
    .filter((caption): caption is Caption => Boolean(caption));
}

function normalizeLangCode(input: string): string {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return 'en';
  const base = value.includes('-') ? value.split('-')[0] : value;
  return base || 'en';
}

function parseQualityNumber(raw: unknown, fallback = 1080): number {
  const value = String(raw || '').trim();
  const matched = value.match(/(2160|1080|720|480|360|240)/);
  return matched ? Number(matched[1]) : fallback;
}

function parseEmbedSuHashFromHtml(html: string): string | null {
  const match = html.match(/window\.vConfig\s*=\s*JSON\.parse\(atob\(`(.+?)`\)\)/);
  if (!match?.[1]) return null;

  try {
    const decodedJson = base64ToUtf8(match[1]);
    const decodedData = JSON.parse(decodedJson) as { hash?: string };
    return parseEmbedSuServerHash(String(decodedData?.hash || ''));
  } catch {
    return null;
  }
}

export async function getVidSrcBypassVideo(params: VidSrcBypassParams): Promise<VidSrcBypassVideoPayload> {
  const encodedId = await encryptId(params.id);
  const url =
    params.type === 'movie'
      ? `${API_BASE}/movie/${encodeURIComponent(encodedId)}`
      : `${API_BASE}/tv/${encodeURIComponent(encodedId)}/${params.season}/${params.episode}`;

  const response = await fetch(url, {
    headers: buildDefaultHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`vidsrc-bypass request failed: HTTP ${response.status}`);
  }

  const encryptedPayload = extractEncryptedPayload(await response.text());
  const decrypted = await decryptClearKey(encryptedPayload);
  return JSON.parse(decrypted) as VidSrcBypassVideoPayload;
}

async function getVidSrcRipFallback(params: VidSrcBypassParams): Promise<{
  kind: 'hls' | 'file' | null;
  playlist?: string;
  qualities?: Record<string, { url: string }>;
  subtitles: Caption[];
  headers: Record<string, string>;
}> {
  const base = 'https://vidsrc.rip';
  const embedUrl =
    params.type === 'movie'
      ? `${base}/embed/movie/${encodeURIComponent(params.id)}`
      : `${base}/embed/tv/${encodeURIComponent(params.id)}/${params.season}/${params.episode}`;

  const htmlRes = await fetch(embedUrl, {
    headers: buildHeadersForOrigin(base),
    signal: AbortSignal.timeout(15000),
  });

  if (!htmlRes.ok) {
    throw new Error(`vidsrc.rip embed request failed: HTTP ${htmlRes.status}`);
  }

  const html = await htmlRes.text();
  const match = html.match(/window\.config\s*=\s*(\{[\s\S]*?\});/);
  if (!match?.[1]) {
    throw new Error('vidsrc.rip config not found in embed page');
  }

  const config = parseVidSrcRipConfig(match[1]);
  const serverRaw = config.server;
  const server = Array.isArray(serverRaw)
    ? String(serverRaw[0] || '').trim()
    : String(serverRaw || (Array.isArray(config.servers) ? config.servers[0] : '') || '').trim();

  if (!server) {
    throw new Error('vidsrc.rip server is missing');
  }

  const keyRes = await fetch(`${base}/images/skip-button.png`, {
    headers: buildHeadersForOrigin(base),
    signal: AbortSignal.timeout(10000),
  });
  const key = (await keyRes.text()).trim();
  if (!key) {
    throw new Error('vidsrc.rip vrf key is empty');
  }

  const path = `/api/source/${server}/${encodeURIComponent(params.id)}`;
  const apiUrl = new URL(`${base}${path}`);
  apiUrl.searchParams.set('vrf', generateVidSrcRipVrf(key, path));

  if (params.type === 'tv') {
    apiUrl.searchParams.set('s', String(params.season));
    apiUrl.searchParams.set('e', String(params.episode));
  }

  const streamRes = await fetch(apiUrl.toString(), {
    headers: buildHeadersForOrigin(base),
    signal: AbortSignal.timeout(15000),
  });

  if (!streamRes.ok) {
    throw new Error(`vidsrc.rip stream request failed: HTTP ${streamRes.status}`);
  }

  const streamData = await streamRes.json() as {
    sources?: Array<{ file?: string; label?: string }>;
    tracks?: Array<{ file?: string; kind?: string; label?: string }>;
  };

  const sources = Array.isArray(streamData?.sources) ? streamData.sources : [];
  const subtitles: Caption[] = Array.isArray(streamData?.tracks)
    ? streamData.tracks
      .filter((track) => String(track?.kind || '').toLowerCase() === 'captions' && String(track?.file || '').trim())
      .map((track, index) => ({
        id: `vidsrcrip-sub-${index}`,
        url: String(track.file),
        language: String(track.label || 'en').toLowerCase(),
        type: String(track.file || '').toLowerCase().includes('.vtt') ? 'vtt' : 'srt',
      }))
    : [];

  const hlsCandidate = sources.find((source) => String(source?.file || '').toLowerCase().includes('.m3u8'));
  if (hlsCandidate?.file) {
    return {
      kind: 'hls',
      playlist: String(hlsCandidate.file),
      subtitles,
      headers: buildHeadersForOrigin(base),
    };
  }

  const qualities: Record<string, { url: string }> = {};
  sources.forEach((source, index) => {
    const url = String(source?.file || '').trim();
    if (!url) return;
    const quality = String(source?.label || `q${index + 1}`).trim() || `q${index + 1}`;
    qualities[quality] = { url };
  });

  if (Object.keys(qualities).length > 0) {
    return { kind: 'file', qualities, subtitles, headers: buildHeadersForOrigin(base) };
  }

  return { kind: null, subtitles, headers: buildHeadersForOrigin(base) };
}

async function getVideasyFallback(params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  const base = 'https://api.videasy.net';
  const headers = buildHeadersForOrigin(base);
  const mediaType = params.type === 'tv' ? 'tv' : 'movie';

  const query = new URLSearchParams({
    mediaType,
    tmdbId: String(params.id),
  });

  if (params.imdbId) query.set('imdbId', params.imdbId);
  if (params.type === 'tv') {
    query.set('seasonId', String(params.season));
    query.set('episodeId', String(params.episode));
  }

  const detailUrl = `${base}/myflixerzupcloud/sources-with-title?${query.toString()}`;
  const detailRes = await fetch(detailUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!detailRes.ok) {
    throw new Error(`videasy request failed: HTTP ${detailRes.status}`);
  }

  const encryptedBody = (await detailRes.text()).trim();
  if (!encryptedBody) {
    return { kind: null, subtitles: [], headers };
  }

  const decryptRes = await fetch('https://enc-dec.app/api/dec-videasy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'referer': 'https://vidsrc-embed.ru/',
      'user-agent': headers['user-agent'],
    },
    body: JSON.stringify({ text: encryptedBody, id: params.id }),
    signal: AbortSignal.timeout(15000),
  });

  if (!decryptRes.ok) {
    throw new Error(`videasy decrypt failed: HTTP ${decryptRes.status}`);
  }

  const decrypted = await decryptRes.json() as {
    result?: {
      sources?: Array<{ url?: string; quality?: string }>;
      subtitles?: Array<{ url?: string; language?: string }>;
    };
  };

  const sources = Array.isArray(decrypted?.result?.sources) ? decrypted.result.sources : [];
  const subtitles: Caption[] = Array.isArray(decrypted?.result?.subtitles)
    ? decrypted.result.subtitles
      .map((item, index) => {
        const file = String(item?.url || '').trim();
        if (!file) return null;
        const language = normalizeLangCode(String(item?.language || 'en'));
        return {
          id: `videasy-sub-${index}`,
          url: file,
          language,
          type: file.toLowerCase().includes('.vtt') ? 'vtt' : 'srt',
        } as Caption;
      })
      .filter((item): item is Caption => Boolean(item))
    : [];

  const directQuality = sources
    .map((item) => ({
      url: String(item?.url || '').trim(),
      quality: parseQualityNumber(item?.quality, 1080),
    }))
    .filter((item) => Boolean(item.url));

  if (!directQuality.length) {
    return { kind: null, subtitles, headers };
  }

  directQuality.sort((a, b) => b.quality - a.quality);
  const best = directQuality[0];

  if (best.url.toLowerCase().includes('.m3u8')) {
    return {
      kind: 'hls',
      playlist: best.url,
      subtitles,
      headers,
    };
  }

  const qualities: Record<string, { url: string }> = {};
  for (const item of directQuality) {
    qualities[String(item.quality)] = { url: item.url };
  }

  return {
    kind: 'file',
    qualities,
    subtitles,
    headers,
  };
}

async function getVixsrcFallback(params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  const base = 'https://vixsrc.to';
  const headers = buildHeadersForOrigin(base);
  const detailUrl = params.type === 'tv'
    ? `${base}/tv/${encodeURIComponent(params.id)}/${params.season}/${params.episode}`
    : `${base}/movie/${encodeURIComponent(params.id)}`;

  const detailRes = await fetch(detailUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!detailRes.ok) {
    throw new Error(`vixsrc request failed: HTTP ${detailRes.status}`);
  }

  const html = await detailRes.text();
  const streamPath = html.match(/url\s*:\s*'([^']+)/i)?.[1] || '';
  const token = html.match(/'token'\s*:\s*'([^']+)/i)?.[1] || '';
  const expires = html.match(/'expires'\s*:\s*'([^']+)/i)?.[1] || '';

  if (!streamPath || !token || !expires) {
    return { kind: null, subtitles: [], headers };
  }

  const directUrl = streamPath.includes('?')
    ? `${streamPath}&token=${encodeURIComponent(token)}&expires=${encodeURIComponent(expires)}&h=1&lang=en`
    : `${streamPath}?token=${encodeURIComponent(token)}&expires=${encodeURIComponent(expires)}&h=1&lang=en`;

  const directRes = await fetch(directUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!directRes.ok) {
    throw new Error(`vixsrc playlist request failed: HTTP ${directRes.status}`);
  }

  const directBody = await directRes.text();
  const lines = directBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('https://vixsrc.to/playlist/') && line.includes('type=video'));

  if (!lines.length) {
    return { kind: null, subtitles: [], headers };
  }

  const qualities: Array<{ quality: number; url: string }> = lines
    .map((line) => ({
      quality: parseQualityNumber(line.match(/rendition=([0-9]+)/i)?.[1] || '', 1080),
      url: line,
    }))
    .filter((item) => Boolean(item.url));

  if (!qualities.length) {
    return { kind: null, subtitles: [], headers };
  }

  qualities.sort((a, b) => b.quality - a.quality);
  return {
    kind: 'hls',
    playlist: qualities[0].url,
    subtitles: [],
    headers,
  };
}

async function encryptVidrockPath(payload: string): Promise<string> {
  const keySeed = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';
  const keyBytes = utf8ToBytes(keySeed);
  const ivBytes = utf8ToBytes(keySeed.slice(0, 16));
  const payloadBytes = utf8ToBytes(payload);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: ivBytes.buffer as ArrayBuffer },
    cryptoKey,
    payloadBytes.buffer as ArrayBuffer,
  );
  const bytes = new Uint8Array(encrypted);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getVidsrcVipFallback(params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  const base = 'https://vidrock.net';
  const headers = buildHeadersForOrigin(base);
  const rawPath = params.type === 'tv'
    ? `${params.id}_${params.season}_${params.episode}`
    : String(params.id);
  const encryptedPath = await encryptVidrockPath(rawPath);
  const apiUrl = `${base}/api/${params.type === 'tv' ? 'tv' : 'movie'}/${encodeURIComponent(encryptedPath)}`;

  const res = await fetch(apiUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`vidsrcvip request failed: HTTP ${res.status}`);
  }

  const data = await res.json() as Record<string, { url?: string }>;
  const qualityBag: Array<{ quality: number; url: string }> = [];

  for (const [key, value] of Object.entries(data || {})) {
    if (!['Astra', 'Nova'].includes(key)) continue;
    const url = String(value?.url || '').trim();
    if (!url) continue;

    if (url.includes('cdn.vidrock.store')) {
      const qualityRes = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (!qualityRes.ok) continue;

      const qualityData = await qualityRes.json() as Array<{ resolution?: string | number; url?: string }>;
      for (const item of qualityData || []) {
        const qUrl = String(item?.url || '').trim();
        if (!qUrl) continue;
        qualityBag.push({ quality: parseQualityNumber(item?.resolution, 1080), url: qUrl });
      }
      continue;
    }

    qualityBag.push({ quality: 1080, url });
  }

  if (!qualityBag.length) {
    return { kind: null, subtitles: [], headers };
  }

  qualityBag.sort((a, b) => b.quality - a.quality);
  return {
    kind: 'hls',
    playlist: qualityBag[0].url,
    subtitles: [],
    headers,
  };
}

async function getVidsrcccFallback(params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  const base = 'https://vidsrc.cc';
  const headers = buildHeadersForOrigin(base);
  const detailUrl = params.type === 'tv'
    ? `${base}/v2/embed/tv/${encodeURIComponent(params.id)}/${params.season}/${params.episode}?autoPlay=false`
    : `${base}/v2/embed/movie/${encodeURIComponent(params.id)}?autoPlay=false`;

  const detailRes = await fetch(detailUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!detailRes.ok) {
    throw new Error(`vidsrccc embed request failed: HTTP ${detailRes.status}`);
  }

  const html = await detailRes.text();
  const userId = html.match(/userId\s*=\s*"([^"]+)/i)?.[1] || '';
  const v = html.match(/var\s*v\s*=\s*"([^"]+)/i)?.[1] || '';
  if (!userId || !v) {
    return { kind: null, subtitles: [], headers };
  }

  const helperUser = `${'BxRJ3LYEj2'.split('').reverse().join('')}_${userId}`;
  const vrfRes = await fetch(`https://aquariumtv.app/vidsrccc?id=${encodeURIComponent(params.id)}&user_id=${encodeURIComponent(helperUser)}`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!vrfRes.ok) {
    throw new Error(`vidsrccc vrf request failed: HTTP ${vrfRes.status}`);
  }

  const vrf = (await vrfRes.text()).trim();
  if (!vrf) {
    return { kind: null, subtitles: [], headers };
  }

  const serversUrl = new URL(`${base}/api/${encodeURIComponent(params.id)}/servers`);
  serversUrl.searchParams.set('id', String(params.id));
  serversUrl.searchParams.set('type', params.type === 'tv' ? 'tv' : 'movie');
  serversUrl.searchParams.set('v', v);
  serversUrl.searchParams.set('vrf', vrf);
  if (params.imdbId) serversUrl.searchParams.set('imdbId', params.imdbId);

  const serversRes = await fetch(serversUrl.toString(), {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!serversRes.ok) {
    throw new Error(`vidsrccc servers request failed: HTTP ${serversRes.status}`);
  }

  const serversData = await serversRes.json() as { data?: Array<{ hash?: string }> };
  const hashes = Array.isArray(serversData?.data)
    ? serversData.data.map((item) => String(item?.hash || '').trim()).filter(Boolean)
    : [];

  for (const hash of hashes) {
    const sourceRes = await fetch(`${base}/api/source/${encodeURIComponent(hash)}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!sourceRes.ok) continue;

    const sourceData = await sourceRes.json() as {
      data?: {
        source?: string;
        subtitles?: Array<{ file?: string; label?: string }>;
      };
    };

    const playlist = String(sourceData?.data?.source || '').trim();
    if (!playlist) continue;

    const subtitles: Caption[] = Array.isArray(sourceData?.data?.subtitles)
      ? sourceData.data.subtitles
        .map((item, index) => {
          const file = String(item?.file || '').trim();
          if (!file) return null;
          const language = normalizeLangCode(String(item?.label || 'en'));
          return {
            id: `vidsrccc-sub-${index}`,
            url: file,
            language,
            type: file.toLowerCase().includes('.vtt') ? 'vtt' : 'srt',
          } as Caption;
        })
        .filter((item): item is Caption => Boolean(item))
      : [];

    return {
      kind: 'hls',
      playlist,
      subtitles,
      headers,
    };
  }

  return { kind: null, subtitles: [], headers };
}

async function getTekiVidSrcXyzEmbed(params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  const base = 'https://vidsrc.xyz';
  const userAgent = buildHeadersForOrigin(base)['user-agent'];
  const urlSearch = params.type === 'tv'
    ? `${base}/embed/tv?tmdb=${encodeURIComponent(params.id)}&season=${params.season}&episode=${params.episode}`
    : `${base}/embed/movie?tmdb=${encodeURIComponent(params.id)}`;

  const searchRes = await fetch(urlSearch, {
    headers: { 'user-agent': userAgent },
    signal: AbortSignal.timeout(15000),
  });

  if (!searchRes.ok) {
    throw new Error(`vidsrc.xyz embed request failed: HTTP ${searchRes.status}`);
  }

  const html = await searchRes.text();
  const embedUrl = extractPlayerIframeUrl(html);
  if (!embedUrl) {
    throw new Error('vidsrc.xyz player iframe not found');
  }

  return {
    kind: 'embed',
    url: embedUrl,
    subtitles: [],
    headers: {},
  };
}

async function getTekiVidSrcToEmbed(params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  const imdbId = String(params.imdbId || '').trim();
  if (!imdbId) {
    return { kind: null, subtitles: [], headers: {} };
  }

  const base = 'https://vidsrc.to';
  const userAgent = buildHeadersForOrigin(base)['user-agent'];
  const urlSearch = params.type === 'tv'
    ? `${base}/embed/tv/${encodeURIComponent(imdbId)}/${params.season}/${params.episode}`
    : `${base}/embed/movie/${encodeURIComponent(imdbId)}`;

  const searchRes = await fetch(urlSearch, {
    headers: { 'user-agent': userAgent },
    signal: AbortSignal.timeout(15000),
  });

  if (!searchRes.ok) {
    throw new Error(`vidsrc.to embed request failed: HTTP ${searchRes.status}`);
  }

  const html = await searchRes.text();
  const embedUrl = extractPlayerIframeUrl(html);
  if (!embedUrl) {
    throw new Error('vidsrc.to iframe not found');
  }

  return {
    kind: 'embed',
    url: embedUrl,
    subtitles: [],
    headers: {},
  };
}

async function getEmbedSuFallback(params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  const base = 'https://embed.su';
  const embedUrl =
    params.type === 'movie'
      ? `${base}/embed/movie/${encodeURIComponent(params.id)}`
      : `${base}/embed/tv/${encodeURIComponent(params.id)}/${params.season}/${params.episode}`;

  const htmlRes = await fetch(embedUrl, {
    headers: buildHeadersForOrigin(base),
    signal: AbortSignal.timeout(15000),
  });
  if (!htmlRes.ok) {
    throw new Error(`embed.su embed request failed: HTTP ${htmlRes.status}`);
  }

  const html = await htmlRes.text();
  const match = html.match(/window\.vConfig\s*=\s*JSON\.parse\(atob\(`(.+?)`\)\)/);
  if (!match?.[1]) {
    throw new Error('embed.su vConfig not found');
  }

  const decodedJson = base64ToUtf8(match[1]);
  const decodedData = JSON.parse(decodedJson) as { hash?: string };
  const serverHash = parseEmbedSuServerHash(String(decodedData?.hash || ''));
  if (!serverHash) {
    throw new Error('embed.su server hash parse failed');
  }

  const streamRes = await fetch(`${base}/api/e/${encodeURIComponent(serverHash)}`, {
    headers: buildHeadersForOrigin(base),
    signal: AbortSignal.timeout(15000),
  });
  if (!streamRes.ok) {
    throw new Error(`embed.su stream request failed: HTTP ${streamRes.status}`);
  }

  const data = await streamRes.json() as {
    source?: string;
    subtitles?: Array<{ label?: string; file?: string }>;
    format?: string;
  };

  const sourceUrl = String(data?.source || '').trim();
  const subtitles = Array.isArray(data?.subtitles)
    ? data.subtitles
      .map((subtitle, index) => {
        const file = String(subtitle?.file || '').trim();
        if (!file) return null;
        const label = String(subtitle?.label || 'en').trim();
        return {
          id: `embedsu-sub-${index}`,
          url: file,
          language: label.toLowerCase(),
          type: file.toLowerCase().includes('.vtt') ? 'vtt' : 'srt',
        } as Caption;
      })
      .filter((subtitle): subtitle is Caption => Boolean(subtitle))
    : [];

  if (!sourceUrl) {
    return { kind: null, subtitles, headers: buildHeadersForOrigin(base) };
  }

  if (sourceUrl.toLowerCase().includes('.m3u8') || String(data?.format || '').toLowerCase().includes('hls')) {
    return {
      kind: 'hls',
      playlist: sourceUrl,
      subtitles,
      headers: buildHeadersForOrigin(base),
    };
  }

  return {
    kind: 'file',
    qualities: { unknown: { url: sourceUrl } },
    subtitles,
    headers: buildHeadersForOrigin(base),
  };
}

async function getVidSrcIcuFallback(_params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  return {
    kind: null,
    subtitles: [],
    headers: buildHeadersForOrigin('https://vidsrc.icu'),
  };
}

export async function resolveVidSrcEndpoint(endpoint: VidSrcEndpointId, params: VidSrcBypassParams): Promise<ResolvedVidSrcResult> {
  const endpointAliases: Partial<Record<VidSrcEndpointId, VidSrcEndpointId>> = {
    vidlink: 'vidlinkpro',
    vidsrcpro: 'embedsu',
    vidsrc: 'vidsrcrip',
    '111movies': 'vidlinkpro',
    '2embedcc': 'embedsu',
    aoneroom: 'vidsrcvip',
    idflix: 'vidsrcvip',
    uniquestream: 'vixsrc',
    tomautoembed: 'embedsu',
    ymovies: 'vidsrcvip',
    yesmovies: 'vidsrcvip',
    ridomovie: 'vidsrcvip',
    primewire: 'vidsrccc',
    fmovies: 'vidsrccc',
  };

  const normalizedEndpoint = endpointAliases[endpoint] || endpoint;

  if (normalizedEndpoint === 'videasy') {
    return getVideasyFallback(params);
  }

  if (normalizedEndpoint === 'vixsrc') {
    return getVixsrcFallback(params);
  }

  if (normalizedEndpoint === 'vidsrcvip') {
    return getVidsrcVipFallback(params);
  }

  if (normalizedEndpoint === 'vidsrccc') {
    return getVidsrcccFallback(params);
  }

  if (normalizedEndpoint === 'vidlinkpro') {
    const payload = await getVidSrcBypassVideo(params);
    return toFallbackResult(payload);
  }

  if (normalizedEndpoint === 'vidsrcrip') {
    try {
      const embedResult = await getTekiVidSrcXyzEmbed(params);
      if (embedResult.kind) return embedResult;
    } catch {
      // try legacy vidsrc.rip flow below
    }
    return getVidSrcRipFallback(params);
  }

  if (normalizedEndpoint === 'embedsu') {
    return getEmbedSuFallback(params);
  }

  try {
    const embedResult = await getTekiVidSrcToEmbed(params);
    if (embedResult.kind) return embedResult;
  } catch {
    // fallback below
  }

  return getVidSrcIcuFallback(params);
}

export function toFallbackResult(payload: VidSrcBypassVideoPayload): ResolvedVidSrcResult {
  const stream = payload?.stream || {};
  const kind = String(stream?.type || '').toLowerCase();
  const subtitles = normalizeCaptions(stream?.captions);
  const headers = {
    ...buildDefaultHeaders(),
    ...(stream?.headers && typeof stream.headers === 'object' ? stream.headers : {}),
  };

  if (kind === 'hls' || kind === 'm3u8') {
    const playlist = String(stream?.playlist || '').trim();
    if (!playlist) {
      return { kind: null, subtitles: [], headers };
    }
    return { kind: 'hls', playlist, subtitles, headers };
  }

  if (kind === 'file' || kind === 'mp4') {
    const rawQualities = stream?.qualities && typeof stream.qualities === 'object'
      ? stream.qualities
      : null;

    const qualities: Record<string, { url: string }> = {};
    if (rawQualities) {
      for (const [qualityKey, qualityValue] of Object.entries(rawQualities)) {
        const url = String((qualityValue as { url?: string })?.url || '').trim();
        if (!url) continue;
        qualities[qualityKey] = { url };
      }
    }

    if (Object.keys(qualities).length === 0) {
      const playlist = String(stream?.playlist || '').trim();
      if (playlist) qualities.unknown = { url: playlist };
    }

    if (Object.keys(qualities).length === 0) {
      return { kind: null, subtitles: [], headers };
    }

    return { kind: 'file', qualities, subtitles, headers };
  }

  const fallbackPlaylist = String(stream?.playlist || '').trim();
  if (fallbackPlaylist) {
    return { kind: 'hls', playlist: fallbackPlaylist, subtitles, headers };
  }

  return { kind: null, subtitles: [], headers };
}
