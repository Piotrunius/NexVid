/* ============================================
   Cloudflare Worker Proxy
   ============================================
   Handles CORS proxying and header forwarding
   for streaming source requests.

   Deploy: npx wrangler deploy
   Dev:    npx wrangler dev
   ============================================ */

export interface Env {
  ALLOWED_ORIGINS: string;
  PROXY_ALLOWED_HOSTS: string;
  DB: D1Database;
  SESSION_TTL_DAYS?: string;
  APP_BASE_URL?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

const PASSWORD_ITERATIONS = 100_000;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ACCOUNTS_PER_IP = 2;

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Origin, X-Requested-With, X-NexVid-Activity',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

function parseCsvSet(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchHostname(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const candidate = pattern.toLowerCase();
  if (candidate === '*') return true;
  if (candidate.startsWith('*.')) {
    const base = candidate.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === candidate;
}

function isOriginAllowed(origin: string, env: Env): boolean {
  const allowed = parseCsvSet(env.ALLOWED_ORIGINS);
  if (allowed.length === 0) return false;
  if (allowed.includes('*')) return true;

  try {
    const originUrl = new URL(origin);
    const originProtocol = originUrl.protocol.toLowerCase();
    const originHost = originUrl.hostname.toLowerCase();
    const originHostWithPort = originUrl.host.toLowerCase();

    return allowed.some((pattern) => {
      if (pattern.startsWith('http://') || pattern.startsWith('https://')) {
        const schemeMatch = pattern.match(/^(https?):\/\/(.+)$/i);
        if (!schemeMatch) return false;

        const patternProtocol = `${schemeMatch[1].toLowerCase()}:`;
        const hostPattern = schemeMatch[2].toLowerCase();
        if (originProtocol !== patternProtocol) return false;

        if (hostPattern.includes(':') && !hostPattern.includes('*')) {
          return originHostWithPort === hostPattern;
        }

        return matchHostname(originHost, hostPattern);
      }

      if (pattern.includes(':') && !pattern.includes('*')) {
        return originHostWithPort === pattern;
      }

      return matchHostname(originHost, pattern);
    });
  } catch {
    return false;
  }
}

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) {
    // If no Origin (server-to-server), use the first one from our config as default
    const allowedStr = env.ALLOWED_ORIGINS || '';
    return allowedStr.split(',')[0].trim() || null;
  }
  return isOriginAllowed(origin, env) ? origin : null;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowedOrigin = getAllowedOrigin(request, env);
  return {
    ...CORS_HEADERS,
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
  };
}

function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json',
    },
  });
}

async function readJson<T = any>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: asArrayBuffer(hexToBytes(saltHex)),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function hashPassword(password: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(saltBytes);
  const digestHex = await pbkdf2Hex(password, saltHex, PASSWORD_ITERATIONS);
  return `pbkdf2$sha256$${PASSWORD_ITERATIONS}$${saltHex}$${digestHex}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<{ ok: boolean; legacy: boolean }> {
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 5) return { ok: false, legacy: false };
    const iterations = Number.parseInt(parts[2], 10);
    if (!Number.isFinite(iterations) || iterations < 10000) return { ok: false, legacy: false };
    const computed = await pbkdf2Hex(password, parts[3], iterations);
    return { ok: secureCompare(computed, parts[4]), legacy: false };
  }

  const legacy = await sha256Hex(password);
  return { ok: secureCompare(legacy, storedHash), legacy: true };
}

function createToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

async function verifyTurnstileToken(request: Request, env: Env, token: string): Promise<boolean> {
  const secret = (env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) return true;
  if (!token || token.trim().length === 0) return false;

  try {
    const formData = new URLSearchParams();
    formData.set('secret', secret);
    formData.set('response', token.trim());

    const ip = getClientIp(request);
    if (ip && ip !== 'unknown') {
      formData.set('remoteip', ip);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!res.ok) return false;
    const data = await res.json<any>().catch(() => null);
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

let securityTablesInit: Promise<void> | null = null;
let feedbackTablesInit: Promise<void> | null = null;
let watchPartyTablesInit: Promise<void> | null = null;
let blockedMediaTableInit: Promise<void> | null = null;

async function ensureBlockedMediaTable(env: Env): Promise<void> {
  if (!blockedMediaTableInit) {
    blockedMediaTableInit = (async () => {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS blocked_media (
           tmdb_id TEXT NOT NULL,
           media_type TEXT NOT NULL,
           reason TEXT,
           created_at TEXT NOT NULL DEFAULT (datetime('now')),
           PRIMARY KEY (tmdb_id, media_type)
         )`
      ).run();
    })();
  }
  await blockedMediaTableInit;
}

async function ensureSecurityTables(env: Env): Promise<void> {
  if (!securityTablesInit) {
    securityTablesInit = (async () => {
      await env.DB.batch([
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS user_identifiers (
             user_id TEXT NOT NULL,
             identifier TEXT NOT NULL,
             id_type TEXT NOT NULL,
             created_at TEXT NOT NULL,
             last_seen_at TEXT NOT NULL,
             PRIMARY KEY (user_id, identifier)
           )`
        ),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_identifiers_identifier ON user_identifiers(identifier)'),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS banned_identifiers (
             identifier TEXT PRIMARY KEY,
             id_type TEXT NOT NULL,
             reason TEXT,
             created_at TEXT NOT NULL,
             created_by_user_id TEXT
           )`
        ),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS banned_usernames (
             username TEXT PRIMARY KEY,
             reason TEXT,
             created_at TEXT NOT NULL,
             created_by_user_id TEXT
           )`
        ),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS banned_ip_hashes (
             ip_hash TEXT PRIMARY KEY,
             ip_label TEXT NOT NULL,
             reason TEXT,
             created_at TEXT NOT NULL,
             created_by_user_id TEXT
           )`
        ),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS account_limit_overrides (
             type TEXT NOT NULL,
             value TEXT NOT NULL,
             value_label TEXT,
             max_accounts INTEGER NOT NULL,
             created_at TEXT NOT NULL,
             updated_at TEXT NOT NULL,
             created_by_user_id TEXT,
             PRIMARY KEY (type, value)
           )`
        ),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS admin_audit_logs (
             id TEXT PRIMARY KEY,
             admin_user_id TEXT NOT NULL,
             action TEXT NOT NULL,
             target_type TEXT NOT NULL,
             target_id TEXT,
             meta_json TEXT,
             created_at TEXT NOT NULL
           )`
        ),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC)'),
      ]);

      try {
        await env.DB.prepare('ALTER TABLE account_limit_overrides ADD COLUMN value_label TEXT').run();
      } catch {
        // already exists on upgraded schemas
      }

      // Ensure admin_users table exists with role column
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS admin_users (
           user_id TEXT PRIMARY KEY,
           role TEXT NOT NULL DEFAULT 'admin',
           granted_by TEXT,
           expires_at TEXT,
           created_at TEXT NOT NULL DEFAULT (datetime('now'))
         )`
      ).run();

      try {
        await env.DB.prepare('ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT \'admin\'').run();
      } catch { /* already exists */ }
      try {
        await env.DB.prepare('ALTER TABLE admin_users ADD COLUMN granted_by TEXT').run();
      } catch { /* already exists */ }
      try {
        await env.DB.prepare('ALTER TABLE admin_users ADD COLUMN expires_at TEXT').run();
      } catch { /* already exists */ }
      try {
        await env.DB.prepare('ALTER TABLE users ADD COLUMN requires_password_change INTEGER DEFAULT 0').run();
      } catch { /* already exists */ }

      // Error tracking for player health - REMOVED
      
      // Daily stats for success rate - REMOVED

      // Table for tracking real-time active users
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS active_users (
           user_id TEXT PRIMARY KEY,
           last_seen_at TEXT NOT NULL
         )`
      ).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_active_users_last_seen ON active_users(last_seen_at)').run();
    })();
  }

  await securityTablesInit;
}

async function handleAdminHealth(request: Request, env: Env): Promise<Response> {
  return json(request, env, { today: { attempts: 0, successes: 0, failures: 0 }, errors: [] });
}

async function handleAdminFebboxTokens(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner', 'admin']);
  if (session instanceof Response) return session;

  if (request.method === 'GET') {
    const tokens = await env.DB.prepare('SELECT * FROM febbox_tokens ORDER BY created_at DESC').all();
    return json(request, env, { items: tokens.results || [] });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ token: string; label?: string }>(request);
    if (!body.token) return json(request, env, { error: 'Token is required' }, 400);
    
    await env.DB.prepare(
      'INSERT INTO febbox_tokens (token, label, created_at) VALUES (?, ?, ?)'
    ).bind(body.token, body.label || 'Public Token', new Date().toISOString()).run();
    
    return json(request, env, { ok: true });
  }

  if (request.method === 'PUT') {
    const body = await readJson<{ token: string; isActive?: boolean; isBanned?: boolean }>(request);
    
    if (typeof body.isActive === 'boolean') {
      await env.DB.prepare('UPDATE febbox_tokens SET is_active = ? WHERE token = ?').bind(body.isActive ? 1 : 0, body.token).run();
    }
    if (typeof body.isBanned === 'boolean') {
      await env.DB.prepare('UPDATE febbox_tokens SET is_banned = ? WHERE token = ?').bind(body.isBanned ? 1 : 0, body.token).run();
    }
    
    return json(request, env, { ok: true });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    await env.DB.prepare('DELETE FROM febbox_tokens WHERE token = ?').bind(token).run();
    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

const lastSeenCache = new Map<string, number>();

async function updateActiveUser(env: Env, request: Request, userId?: string): Promise<void> {
  try {
    const nowMs = Date.now();
    const identifier = userId || `guest_${await sha256Hex(request.headers.get('CF-Connecting-IP') || '0.0.0.0')}`;
    
    // In-memory throttle to 2 minutes
    const last = lastSeenCache.get(`active:${identifier}`);
    if (last && nowMs - last < 2 * 60 * 1000) return;
    lastSeenCache.set(`active:${identifier}`, nowMs);

    const now = new Date().toISOString();
    // Throttle updates in DB to once every 3 minutes
    await env.DB.prepare(
      `INSERT INTO active_users (user_id, last_seen_at) 
       VALUES (?, ?) 
       ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
       WHERE excluded.last_seen_at > datetime(last_seen_at, '+3 minutes')`
    ).bind(identifier, now).run();
  } catch {
    // ignore
  }
}

async function getActiveUsersCount(env: Env): Promise<{ users: number; guests: number }> {
  try {
    // Now looking at the last 5 minutes for a much more real-time feel
    const activeWindowAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const rows = await env.DB.prepare(
      'SELECT user_id FROM active_users WHERE last_seen_at > ?'
    ).bind(activeWindowAgo).all<{ user_id: string }>();
    
    const results = rows.results || [];
    const users = results.filter(r => !r.user_id.startsWith('guest_')).length;
    const guests = results.filter(r => r.user_id.startsWith('guest_')).length;
    
    return { users, guests };
  } catch {
    return { users: 0, guests: 0 };
  }
}

async function getUserRole(env: Env, userId: string): Promise<string | null> {
  try {
    const row = await env.DB.prepare('SELECT user_id, role, expires_at FROM admin_users WHERE user_id = ?').bind(userId).first<{ user_id: string; role: string; expires_at: string | null }>();
    if (!row?.user_id) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      // Expired admin – remove entry
      await env.DB.prepare('DELETE FROM admin_users WHERE user_id = ?').bind(userId).run();
      return null;
    }
    return row.role || 'admin';
  } catch {
    return null;
  }
}

async function ensureFeedbackTables(env: Env): Promise<void> {
  if (!feedbackTablesInit) {
    feedbackTablesInit = (async () => {
      await env.DB.batch([
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS feedback_threads (
             id TEXT PRIMARY KEY,
             user_id TEXT NOT NULL,
             category TEXT NOT NULL,
             subject TEXT NOT NULL,
             status TEXT NOT NULL,
             created_at TEXT NOT NULL,
             updated_at TEXT NOT NULL,
             last_reply_at TEXT NOT NULL,
             admin_last_reply_at TEXT,
             user_last_reply_at TEXT
           )`
        ),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_threads_user ON feedback_threads(user_id, updated_at DESC)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_threads_status ON feedback_threads(status, updated_at DESC)'),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS feedback_messages (
             id TEXT PRIMARY KEY,
             thread_id TEXT NOT NULL,
             sender_user_id TEXT,
             sender_role TEXT NOT NULL,
             message TEXT NOT NULL,
             created_at TEXT NOT NULL
           )`
        ),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread ON feedback_messages(thread_id, created_at ASC)'),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS user_notifications (
             id TEXT PRIMARY KEY,
             user_id TEXT NOT NULL,
             type TEXT NOT NULL,
             title TEXT NOT NULL,
             message TEXT NOT NULL,
             thread_id TEXT,
             is_read INTEGER NOT NULL,
             created_at TEXT NOT NULL
           )`
        ),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, is_read, created_at DESC)'),
      ]);
    })();
  }

  await feedbackTablesInit;
}

async function ensureWatchPartyTables(env: Env): Promise<void> {
  if (!watchPartyTablesInit) {
    watchPartyTablesInit = (async () => {
      await env.DB.batch([
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS watch_party_rooms (
             id TEXT PRIMARY KEY,
             host_token TEXT NOT NULL,
             host_user_id TEXT,
             host_name TEXT NOT NULL,
             media_key TEXT NOT NULL,
             media_type TEXT,
             media_id TEXT,
             season INTEGER,
             episode INTEGER,
             title TEXT,
             state_json TEXT NOT NULL,
             participant_count INTEGER NOT NULL DEFAULT 1,
             created_at TEXT NOT NULL,
             updated_at TEXT NOT NULL,
             expires_at TEXT NOT NULL
           )`
          ),

        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_watch_party_rooms_expires ON watch_party_rooms(expires_at)'),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS watch_party_participants (
             room_id TEXT NOT NULL,
             participant_id TEXT NOT NULL,
             user_id TEXT,
             name TEXT NOT NULL,
             is_host INTEGER NOT NULL DEFAULT 0,
             created_at TEXT NOT NULL,
             last_seen_at TEXT NOT NULL,
             PRIMARY KEY (room_id, participant_id)
           )`
        ),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_watch_party_participants_room ON watch_party_participants(room_id, last_seen_at DESC)'),
      ]);
    })();
  }
  await watchPartyTablesInit;
}

function generateWatchPartyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < bytes.length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

function getWatchPartyExpiryIso(hours = 8): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function cleanupExpiredWatchParties(env: Env): Promise<void> {
  // Only run cleanup with a 5% chance per request to save D1 writes
  if (Math.random() > 0.05) return;
  
  await ensureWatchPartyTables(env);
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM watch_party_participants
       WHERE room_id IN (
         SELECT id FROM watch_party_rooms
         WHERE datetime(expires_at) <= datetime('now')
       )`
    ),
    env.DB.prepare(`DELETE FROM watch_party_rooms WHERE datetime(expires_at) <= datetime('now')`),
  ]);
}

type RequestIdentifiers = {
  ip: string;
  ipHash: string;
  fingerprintHash: string;
};

async function getRequestIdentifiers(request: Request): Promise<RequestIdentifiers> {
  const ip = getClientIp(request);
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 500);
  const ipHash = await sha256Hex(`ip:${ip}`);
  const fingerprintHash = await sha256Hex(`fp:${ip}|${userAgent}`);
  return { ip, ipHash, fingerprintHash };
}

async function getBannedIdentifierReason(env: Env, identifiers: RequestIdentifiers): Promise<string | null> {
  await ensureSecurityTables(env);
  const row = await env.DB
    .prepare('SELECT reason FROM banned_identifiers WHERE identifier IN (?, ?) LIMIT 1')
    .bind(identifiers.ipHash, identifiers.fingerprintHash)
    .first<{ reason: string | null }>();
  if (!row) return null;
  const reason = (row.reason || '').trim();
  return reason || 'Device/network banned';
}

async function enforceNoMultiAccount(env: Env, identifiers: RequestIdentifiers, normalizedUsername: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureSecurityTables(env);

  const usernameOverride = await env.DB
    .prepare('SELECT max_accounts FROM account_limit_overrides WHERE type = ? AND value = ? LIMIT 1')
    .bind('username', normalizedUsername)
    .first<{ max_accounts: number }>();
  if (usernameOverride?.max_accounts && usernameOverride.max_accounts > 0) {
    return { ok: true };
  }

  const linkedUsernameOverride = await env.DB
    .prepare(
      `SELECT MAX(o.max_accounts) AS max_accounts
       FROM user_identifiers ui
       JOIN users u ON u.id = ui.user_id
       JOIN account_limit_overrides o ON o.type = 'username' AND o.value = LOWER(u.username)
       WHERE ui.identifier = ? AND ui.id_type = 'ip'`
    )
    .bind(identifiers.ipHash)
    .first<{ max_accounts: number | null }>();

  const ipOverride = await env.DB
    .prepare('SELECT max_accounts FROM account_limit_overrides WHERE type = ? AND value = ? LIMIT 1')
    .bind('ip', identifiers.ipHash)
    .first<{ max_accounts: number }>();

  const maxAccounts = Math.max(
    DEFAULT_MAX_ACCOUNTS_PER_IP,
    Number(ipOverride?.max_accounts || DEFAULT_MAX_ACCOUNTS_PER_IP),
    Number(linkedUsernameOverride?.max_accounts || DEFAULT_MAX_ACCOUNTS_PER_IP),
  );
  const current = await env.DB
    .prepare('SELECT COUNT(DISTINCT user_id) AS count FROM user_identifiers WHERE identifier = ? AND id_type = ?')
    .bind(identifiers.ipHash, 'ip')
    .first<{ count: number }>();

  if ((current?.count || 0) >= maxAccounts) {
    return { ok: false, error: `Account limit reached for this network (${maxAccounts}).` };
  }

  return { ok: true };
}

async function linkUserIdentifiers(env: Env, userId: string, identifiers: RequestIdentifiers): Promise<void> {
  const nowMs = Date.now();
  const cacheKey = `link:${userId}:${identifiers.ipHash}`;
  const last = lastSeenCache.get(cacheKey);
  if (last && nowMs - last < 10 * 60 * 1000) return;
  lastSeenCache.set(cacheKey, nowMs);

  await ensureSecurityTables(env);
  const now = new Date().toISOString();
  // Throttle updates to once every 15 minutes to save D1 writes
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO user_identifiers (user_id, identifier, id_type, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, identifier) DO UPDATE SET last_seen_at = excluded.last_seen_at
       WHERE excluded.last_seen_at > datetime(last_seen_at, '+15 minutes')`
    ).bind(userId, identifiers.ipHash, 'ip', now, now),
    env.DB.prepare(
      `INSERT INTO user_identifiers (user_id, identifier, id_type, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, identifier) DO UPDATE SET last_seen_at = excluded.last_seen_at
       WHERE excluded.last_seen_at > datetime(last_seen_at, '+15 minutes')`
    ).bind(userId, identifiers.fingerprintHash, 'fingerprint', now, now),
  ]);
}

async function checkLoginRateLimit(request: Request, env: Env, email: string): Promise<{ blocked: boolean; retryAfterSec?: number; key: string }> {
  const ip = getClientIp(request);
  const key = await sha256Hex(`${email}|${ip}`);
  try {
    const row = await env.DB.prepare('SELECT failures, reset_at, blocked_until FROM login_attempts WHERE key = ?').bind(key).first<{
      failures: number;
      reset_at: string;
      blocked_until: string | null;
    }>();

    if (!row) return { blocked: false, key };
    const now = Date.now();
    const blockedUntil = row.blocked_until ? Date.parse(row.blocked_until) : 0;
    if (blockedUntil > now) {
      return { blocked: true, retryAfterSec: Math.ceil((blockedUntil - now) / 1000), key };
    }

    const resetAt = Date.parse(row.reset_at);
    if (!Number.isFinite(resetAt) || resetAt <= now) {
      await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
    }
  } catch {
    return { blocked: false, key };
  }

  return { blocked: false, key };
}

async function registerFailedLogin(env: Env, key: string) {
  try {
    const now = Date.now();
    const resetAt = new Date(now + LOGIN_WINDOW_MS).toISOString();
    const row = await env.DB.prepare('SELECT failures, reset_at FROM login_attempts WHERE key = ?').bind(key).first<{ failures: number; reset_at: string }>();

    let failures = 1;
    if (row) {
      const activeWindow = Date.parse(row.reset_at) > now;
      failures = activeWindow ? row.failures + 1 : 1;
    }

    const blockedUntil = failures >= LOGIN_MAX_FAILURES ? new Date(now + LOGIN_BLOCK_MS).toISOString() : null;
    await env.DB.prepare(
      `INSERT INTO login_attempts (key, failures, reset_at, blocked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, reset_at = excluded.reset_at, blocked_until = excluded.blocked_until`
    ).bind(key, failures, resetAt, blockedUntil).run();
  } catch {
    // do not fail auth flow on rate-limit storage issues
  }
}

async function clearFailedLogin(env: Env, key: string) {
  try {
    await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
  } catch {
    // ignore cleanup failures
  }
}

type SessionUser = {
  token: string;
  user: {
    id: string;
    username: string;
    email?: string;
    createdAt: string;
    isAdmin: boolean;
    role: string | null;
    requiresPasswordChange: boolean;
  };
};

type AnnouncementType = 'info' | 'warning' | 'update' | 'success';

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function isValidUsername(value: string): boolean {
  const candidate = value.trim();
  return /^[a-zA-Z0-9._-]{2,24}$/.test(candidate);
}

function isValidIp(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(candidate) || (candidate.includes(':') && ipv6.test(candidate));
}

function sanitizeAnnouncementType(value: string | undefined): AnnouncementType {
  const candidate = (value || 'info').toLowerCase();
  if (candidate === 'warning' || candidate === 'update' || candidate === 'success') return candidate;
  return 'info';
}

function sanitizeOptionalHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

type FeedbackCategory = 'bug' | 'feedback' | 'contact' | 'feature';
type FeedbackStatus = 'open' | 'answered' | 'closed';
const CLOSED_FEEDBACK_RETENTION_DAYS = 14;
const CLOSED_FEEDBACK_RETENTION_MS = CLOSED_FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function sanitizeFeedbackCategory(value: string | undefined): FeedbackCategory {
  const candidate = (value || '').trim().toLowerCase();
  if (candidate === 'bug' || candidate === 'feature' || candidate === 'contact') return candidate;
  return 'feedback';
}

function sanitizeFeedbackStatus(value: string | undefined): FeedbackStatus {
  const candidate = (value || '').trim().toLowerCase();
  if (candidate === 'answered' || candidate === 'closed') return candidate;
  return 'open';
}

function sanitizeFeedbackSubject(value: string | undefined): string {
  return (value || '').trim().slice(0, 120);
}

function sanitizeFeedbackMessage(value: string | undefined): string {
  return (value || '').trim().slice(0, 4000);
}

function getClosedFeedbackExpiresAt(updatedAt: string): string {
  const updatedMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedMs)) return new Date().toISOString();
  return new Date(updatedMs + CLOSED_FEEDBACK_RETENTION_MS).toISOString();
}

function getClosedFeedbackRemainingMs(updatedAt: string): number {
  const expiresAtMs = Date.parse(getClosedFeedbackExpiresAt(updatedAt));
  if (!Number.isFinite(expiresAtMs)) return 0;
  return Math.max(0, expiresAtMs - Date.now());
}

async function cleanupExpiredClosedFeedbackThreads(env: Env): Promise<number> {
  await ensureFeedbackTables(env);

  const expired = await env.DB.prepare(
    `SELECT id
     FROM feedback_threads
     WHERE status = 'closed'
       AND datetime(updated_at) <= datetime('now', '-${CLOSED_FEEDBACK_RETENTION_DAYS} days')
     LIMIT 1000`
  ).all<{ id: string }>();

  const threadIds = (expired.results || []).map((row) => row.id).filter(Boolean);
  if (threadIds.length === 0) return 0;

  const placeholders = threadIds.map(() => '?').join(', ');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM feedback_messages WHERE thread_id IN (${placeholders})`).bind(...threadIds),
    env.DB.prepare(`DELETE FROM user_notifications WHERE thread_id IN (${placeholders})`).bind(...threadIds),
    env.DB.prepare(`DELETE FROM feedback_threads WHERE id IN (${placeholders})`).bind(...threadIds),
  ]);

  return threadIds.length;
}

async function isAdminUser(env: Env, userId: string): Promise<boolean> {
  try {
    const row = await env.DB.prepare('SELECT user_id, expires_at FROM admin_users WHERE user_id = ?').bind(userId).first<{ user_id: string; expires_at: string | null }>();
    if (!row?.user_id) return false;
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      // Expired admin – remove entry
      await env.DB.prepare('DELETE FROM admin_users WHERE user_id = ?').bind(userId).run();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}



async function getUsernameBanInfo(env: Env, username: string): Promise<{ banned: boolean; reason?: string }> {
  await ensureSecurityTables(env);
  try {
    const normalized = normalizeUsername(username);
    const row = await env.DB.prepare('SELECT reason FROM banned_usernames WHERE username = ?').bind(normalized).first<{ reason: string | null }>();
    if (!row) return { banned: false };
    const reason = (row.reason || '').trim();
    return { banned: true, ...(reason ? { reason } : {}) };
  } catch {
    return { banned: false };
  }
}



async function writeAdminAuditLog(
  env: Env,
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  meta: Record<string, unknown> | null,
) {
  try {
    await env.DB.prepare(
      `INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), adminUserId, action, targetType, targetId, meta ? JSON.stringify(meta) : null, new Date().toISOString())
      .run();
  } catch {
    // audit must never break primary action
  }
}

async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.created_at, u.requires_password_change
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  )
    .bind(token, new Date().toISOString())
    .first<{ id: string; username: string; created_at: string; requires_password_change: number }>();

  if (!row) return null;

  const identifiers = await getRequestIdentifiers(request);
  const bannedIdentifierReason = await getBannedIdentifierReason(env, identifiers);
  if (bannedIdentifierReason) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }

  const usernameBan = await getUsernameBanInfo(env, row.username);
  if (usernameBan.banned) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }

  await linkUserIdentifiers(env, row.id, identifiers);

  const adminRole = await getUserRole(env, row.id);
  await updateActiveUser(env, request, row.id);

  return {
    token,
    user: {
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
      isAdmin: adminRole !== null,
      role: adminRole,
      requiresPasswordChange: Boolean(row.requires_password_change),
    },
  };
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ username?: string; password?: string; turnstileToken?: string }>(request);
  const username = (body.username || '').trim();
  const normalizedUsername = normalizeUsername(username);
  const password = body.password || '';
  const turnstileToken = (body.turnstileToken || '').trim();

  if ((env.TURNSTILE_SECRET_KEY || '').trim()) {
    const verified = await verifyTurnstileToken(request, env, turnstileToken);
    if (!verified) return json(request, env, { error: 'Captcha verification failed' }, 403);
  }

  if (!isValidUsername(username) || password.length < 6) {
    return json(request, env, { error: 'Invalid username or password (nickname: 2-24 chars, letters/numbers/._-)' }, 400);
  }

  const usernameBan = await getUsernameBanInfo(env, normalizedUsername);
  if (usernameBan.banned) {
    const message = usernameBan.reason ? `Registration blocked: ${usernameBan.reason}` : 'Registration blocked: this nickname is banned';
    return json(request, env, { error: message }, 403);
  }

  const identifiers = await getRequestIdentifiers(request);
  const bannedIdentifierReason = await getBannedIdentifierReason(env, identifiers);
  if (bannedIdentifierReason) {
    return json(request, env, { error: `Registration blocked: ${bannedIdentifierReason}` }, 403);
  }

  const noMulti = await enforceNoMultiAccount(env, identifiers, normalizedUsername);
  if (!noMulti.ok) {
    return json(request, env, { error: noMulti.error }, 429);
  }

  const existing = await env.DB
    .prepare('SELECT id FROM users WHERE LOWER(username) = ?')
    .bind(normalizedUsername)
    .first<{ id: string }>();
  if (existing?.id) return json(request, env, { error: 'Nickname already in use' }, 409);

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const token = createToken();
  const ttlDays = Number(env.SESSION_TTL_DAYS || '30');
  const expires = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').bind(userId, username, passwordHash, now),
    env.DB.prepare('INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, ?)').bind(userId, '{}', now),
    env.DB.prepare('INSERT INTO watchlist (user_id, items_json, updated_at) VALUES (?, ?, ?)').bind(userId, '[]', now),
    env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(token, userId, now, expires),
  ]);

  await linkUserIdentifiers(env, userId, identifiers);

  return json(request, env, {
    user: {
      id: userId,
      username,
      createdAt: now,
      isAdmin: false,
      role: null,
    },
    token,
  });
}

async function handlePasswordChange(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);

  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return json(request, env, { error: 'Invalid password data' }, 400);
  }

  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(session.user.id).first<{ password_hash: string }>();
  if (!row) return json(request, env, { error: 'User not found' }, 404);

  const verification = await verifyPassword(currentPassword, row.password_hash);
  if (!verification.ok) return json(request, env, { error: 'Current password incorrect' }, 401);

  const newHash = await hashPassword(newPassword);
  await env.DB.prepare('UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE id = ?').bind(newHash, session.user.id).run();

  return json(request, env, { ok: true });
}

async function handleVerifyEmail(request: Request, env: Env): Promise<Response> {
  return json(request, env, { ok: true, message: 'Email verification is disabled.' });
}

async function handleResendVerification(request: Request, env: Env): Promise<Response> {
  return json(request, env, { ok: true, message: 'Email verification is disabled.' });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ username?: string; password?: string; turnstileToken?: string }>(request);
  const username = (body.username || '').trim();
  const normalizedUsername = normalizeUsername(username);
  const password = body.password || '';
  const turnstileToken = (body.turnstileToken || '').trim();

  if ((env.TURNSTILE_SECRET_KEY || '').trim()) {
    const verified = await verifyTurnstileToken(request, env, turnstileToken);
    if (!verified) return json(request, env, { error: 'Captcha verification failed' }, 403);
  }

  if (!username || !password) {
    return json(request, env, { error: 'Missing nickname or password' }, 400);
  }

  if (!isValidUsername(username)) {
    return json(request, env, { error: 'Invalid nickname format' }, 400);
  }

  const limit = await checkLoginRateLimit(request, env, normalizedUsername);
  if (limit.blocked) {
    return json(request, env, { error: 'Too many failed attempts. Try again later.' }, 429);
  }

  const identifiers = await getRequestIdentifiers(request);
  const bannedIdentifierReason = await getBannedIdentifierReason(env, identifiers);
  if (bannedIdentifierReason) {
    return json(request, env, { error: `Login blocked: ${bannedIdentifierReason}` }, 403);
  }

  const usernameBan = await getUsernameBanInfo(env, normalizedUsername);
  if (usernameBan.banned) {
    const message = usernameBan.reason ? `Login blocked: ${usernameBan.reason}` : 'Login blocked: this nickname is banned';
    return json(request, env, { error: message }, 403);
  }

  const row = await env.DB.prepare('SELECT id, username, password_hash, created_at FROM users WHERE LOWER(username) = ?')
    .bind(normalizedUsername)
    .first<{ id: string; username: string; password_hash: string; created_at: string }>();

  if (!row) {
    await registerFailedLogin(env, limit.key);
    return json(request, env, { error: 'Invalid credentials' }, 401);
  }

  const verification = await verifyPassword(password, row.password_hash);
  if (!verification.ok) {
    await registerFailedLogin(env, limit.key);
    return json(request, env, { error: 'Invalid credentials' }, 401);
  }

  await clearFailedLogin(env, limit.key);

  if (verification.legacy) {
    try {
      const upgradedHash = await hashPassword(password);
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(upgradedHash, row.id).run();
    } catch {
      // best-effort migration; successful login must not fail
    }
  }

  const now = new Date().toISOString();
  const token = createToken();
  const ttlDays = Number(env.SESSION_TTL_DAYS || '30');
  const expires = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, row.id, now, expires)
    .run();

  await linkUserIdentifiers(env, row.id, identifiers);

  const role = await getUserRole(env, row.id);
  await updateActiveUser(env, request, row.id);

  return json(request, env, {
    user: {
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
      isAdmin: role !== null,
      role,
    },
    token,
  });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = getBearerToken(request);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return json(request, env, { ok: true });
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);
  return json(request, env, { user: session.user });
}

async function handleProfile(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);
  if (request.method !== 'PUT') return json(request, env, { error: 'Method not allowed' }, 405);

  const body = await readJson<{ username?: string }>(request);
  const username = (body.username || '').trim();
  const normalized = normalizeUsername(username);

  if (!isValidUsername(username)) {
    return json(request, env, { error: 'Invalid nickname (2-24 chars, letters/numbers/._-)' }, 400);
  }

  if (normalized === normalizeUsername(session.user.username)) {
    return json(request, env, { ok: true, user: { ...session.user, username } });
  }

  const banned = await getUsernameBanInfo(env, normalized);
  if (banned.banned) {
    return json(request, env, { error: banned.reason ? `Nickname blocked: ${banned.reason}` : 'Nickname is banned' }, 403);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?').bind(normalized, session.user.id).first<{ id: string }>();
  if (existing?.id) {
    return json(request, env, { error: 'Nickname already in use' }, 409);
  }

  await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, session.user.id).run();
  const role = await getUserRole(env, session.user.id);
  return json(request, env, {
    ok: true,
    user: {
      id: session.user.id,
      username,
      createdAt: session.user.createdAt,
      isAdmin: role !== null,
      role,
    },
  });
}

async function handleSettings(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);

  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').bind(session.user.id).first<{ settings_json: string }>();
    return json(request, env, { settings: row?.settings_json ? JSON.parse(row.settings_json) : {} });
  }

  const body = await readJson<{ settings?: Record<string, unknown> }>(request);
  const payload = JSON.stringify(body.settings || {});
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO user_settings (user_id, settings_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`
  )
    .bind(session.user.id, payload, now)
    .run();

  return json(request, env, { ok: true });
}

async function handleWatchlist(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);

  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT items_json FROM watchlist WHERE user_id = ?').bind(session.user.id).first<{ items_json: string }>();
    return json(request, env, { items: row?.items_json ? JSON.parse(row.items_json) : [] });
  }

  const body = await readJson<{ items?: unknown[] }>(request);
  const payload = JSON.stringify(body.items || []);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO watchlist (user_id, items_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET items_json = excluded.items_json, updated_at = excluded.updated_at`
  )
    .bind(session.user.id, payload, now)
    .run();

  return json(request, env, { ok: true });
}

async function handleWatchPartyCreate(request: Request, env: Env): Promise<Response> {
  await cleanupExpiredWatchParties(env);

  const session = await getSessionUser(request, env);
  const body = await readJson<{
    mediaKey?: string;
    mediaType?: string;
    mediaId?: string;
    season?: number;
    episode?: number;
    title?: string;
    name?: string;
    paused?: boolean;
    time?: number;
    playbackRate?: number;
  }>(request);

  const mediaKey = String(body.mediaKey || '').trim();
  if (!mediaKey) return json(request, env, { error: 'mediaKey is required' }, 400);

  const hostToken = createToken();
  const participantId = createToken().slice(0, 16);
  const hostName = String(body.name || session?.user.username || 'Host').trim().slice(0, 24) || 'Host';
  const now = new Date().toISOString();
  const expiresAt = getWatchPartyExpiryIso(8);

  const state = {
    paused: Boolean(body.paused ?? true),
    time: Math.max(0, Number(body.time || 0)),
    playbackRate: Math.min(2, Math.max(0.25, Number(body.playbackRate || 1))),
    mediaKey,
    updatedAt: now,
  };

  let roomId = '';
  for (let i = 0; i < 8; i += 1) {
    const candidate = generateWatchPartyCode();
    const exists = await env.DB.prepare('SELECT id FROM watch_party_rooms WHERE id = ?').bind(candidate).first<{ id: string }>();
    if (!exists?.id) {
      roomId = candidate;
      break;
    }
  }

  if (!roomId) return json(request, env, { error: 'Could not allocate room code' }, 500);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO watch_party_rooms
       (id, host_token, host_user_id, host_name, media_key, media_type, media_id, season, episode, title, state_json, participant_count, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      roomId,
      hostToken,
      session?.user.id || null,
      hostName,
      mediaKey,
      body.mediaType ? String(body.mediaType).slice(0, 16) : null,
      body.mediaId ? String(body.mediaId).slice(0, 64) : null,
      Number.isFinite(Number(body.season)) ? Number(body.season) : null,
      Number.isFinite(Number(body.episode)) ? Number(body.episode) : null,
      body.title ? String(body.title).slice(0, 200) : null,
      JSON.stringify(state),
      1,
      now,
      now,
      expiresAt,
    ),
    env.DB.prepare(
      `INSERT INTO watch_party_participants
       (room_id, participant_id, user_id, name, is_host, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).bind(roomId, participantId, session?.user.id || null, hostName, now, now),
  ]);

  return json(request, env, {
    ok: true,
    roomId,
    hostToken,
    participantId,
    role: 'host',
    state,
    recommendedHostPushMs: 4000,
    recommendedGuestPollMs: 10000,
  });
}

async function handleWatchPartyJoin(request: Request, env: Env): Promise<Response> {
  await cleanupExpiredWatchParties(env);

  const session = await getSessionUser(request, env);
  const body = await readJson<{ roomId?: string; name?: string; participantId?: string; mediaKey?: string }>(request);
  const roomId = String(body.roomId || '').trim().toUpperCase();
  if (!roomId) return json(request, env, { error: 'roomId is required' }, 400);

  const room = await env.DB.prepare(
    `SELECT id, host_name, media_key, media_type, media_id, season, episode, title, state_json, updated_at
     FROM watch_party_rooms
     WHERE id = ? AND datetime(expires_at) > datetime('now')`
  ).bind(roomId).first<{
    id: string;
    host_name: string;
    media_key: string;
    media_type: string | null;
    media_id: string | null;
    season: number | null;
    episode: number | null;
    title: string | null;
    state_json: string;
    updated_at: string;
  }>();

  if (!room?.id) return json(request, env, { error: 'Room not found or expired' }, 404);

  if (body.mediaKey && String(body.mediaKey) !== room.media_key) {
    return json(request, env, { error: 'This room is for a different title' }, 409);
  }

  const now = new Date().toISOString();
  const participantId = String(body.participantId || createToken().slice(0, 16)).slice(0, 32);
  const name = String(body.name || session?.user.username || 'Guest').trim().slice(0, 24) || 'Guest';

  await env.DB.prepare(
    `INSERT INTO watch_party_participants (room_id, participant_id, user_id, name, is_host, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(room_id, participant_id)
     DO UPDATE SET name = excluded.name, user_id = excluded.user_id, last_seen_at = excluded.last_seen_at`
  ).bind(roomId, participantId, session?.user.id || null, name, now, now).run();

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM watch_party_participants WHERE room_id = ?'
  ).bind(roomId).first<{ count: number }>();

  await env.DB.prepare(
    'UPDATE watch_party_rooms SET participant_count = ?, updated_at = ?, expires_at = ? WHERE id = ?'
  ).bind(Number(countRow?.count || 1), now, getWatchPartyExpiryIso(8), roomId).run();

  return json(request, env, {
    ok: true,
    roomId,
    participantId,
    role: 'guest',
    hostName: room.host_name,
    mediaKey: room.media_key,
    mediaType: room.media_type,
    mediaId: room.media_id,
    season: room.season,
    episode: room.episode,
    title: room.title,
    state: JSON.parse(room.state_json || '{}'),
    updatedAt: room.updated_at,
    recommendedGuestPollMs: 10000,
  });
}

async function handleWatchPartyState(request: Request, env: Env): Promise<Response> {
  await cleanupExpiredWatchParties(env);
  const url = new URL(request.url);
  const roomId = (url.searchParams.get('roomId') || '').trim().toUpperCase();
  const since = (url.searchParams.get('since') || '').trim();
  if (!roomId) return json(request, env, { error: 'roomId is required' }, 400);

  const room = await env.DB.prepare(
    `SELECT id, host_name, media_key, media_type, media_id, season, episode, title, state_json, participant_count, updated_at
     FROM watch_party_rooms
     WHERE id = ? AND datetime(expires_at) > datetime('now')`
  ).bind(roomId).first<{
    id: string;
    host_name: string;
    media_key: string;
    media_type: string | null;
    media_id: string | null;
    season: number | null;
    episode: number | null;
    title: string | null;
    state_json: string;
    participant_count: number;
    updated_at: string;
  }>();

  if (!room?.id) return json(request, env, { error: 'Room not found or expired' }, 404);

  const now = new Date().toISOString();
  const state = JSON.parse(room.state_json || '{}');
  const isPaused = Boolean(state.paused ?? true);

  return json(request, env, {
    ok: true,
    changed: true,
    roomId,
    hostName: room.host_name,
    mediaKey: room.media_key,
    mediaType: room.media_type,
    mediaId: room.media_id,
    season: room.season,
    episode: room.episode,
    title: room.title,
    state,
    participantCount: room.participant_count || 1,
    updatedAt: room.updated_at,
    serverNow: now,
    recommendedGuestPollMs: isPaused ? 5000 : 2500,
  });
}

async function handleWatchPartyUpdate(request: Request, env: Env): Promise<Response> {
  await cleanupExpiredWatchParties(env);
  const body = await readJson<{
    roomId?: string;
    hostToken?: string;
    paused?: boolean;
    time?: number;
    playbackRate?: number;
    mediaKey?: string;
  }>(request);

  const roomId = String(body.roomId || '').trim().toUpperCase();
  const hostToken = String(body.hostToken || '').trim();
  if (!roomId || !hostToken) return json(request, env, { error: 'roomId and hostToken are required' }, 400);

  const room = await env.DB.prepare(
    `SELECT id, host_token, media_key, state_json
     FROM watch_party_rooms
     WHERE id = ? AND datetime(expires_at) > datetime('now')`
  ).bind(roomId).first<{ id: string; host_token: string; media_key: string; state_json: string }>();

  if (!room?.id) return json(request, env, { error: 'Room not found or expired' }, 404);
  if (hostToken !== room.host_token) return json(request, env, { error: 'Invalid host token' }, 403);

  const now = new Date().toISOString();
  const newState = {
    paused: Boolean(body.paused ?? true),
    time: Math.max(0, Number(body.time || 0)),
    playbackRate: Math.min(2, Math.max(0.25, Number(body.playbackRate || 1))),
    mediaKey: String(body.mediaKey || room.media_key),
    updatedAt: now,
  };

  // Optimization: Only update DB if state actually changed significantly
  const currentState = JSON.parse(room.state_json || '{}');
  const hasSignificantChange = 
    newState.paused !== currentState.paused ||
    newState.mediaKey !== currentState.mediaKey ||
    newState.playbackRate !== currentState.playbackRate ||
    Math.abs(newState.time - (currentState.time || 0)) > 5; // only update if time drifted by > 5s

  if (!hasSignificantChange) {
    return json(request, env, { ok: true, updatedAt: currentState.updatedAt || now });
  }

  await env.DB.prepare(
    `UPDATE watch_party_rooms
     SET state_json = ?, updated_at = ?, expires_at = ?
     WHERE id = ?`
  ).bind(JSON.stringify(newState), now, getWatchPartyExpiryIso(8), roomId).run();

  return json(request, env, { ok: true, updatedAt: now });
}

async function handleWatchPartyLeave(request: Request, env: Env): Promise<Response> {
  await cleanupExpiredWatchParties(env);
  const body = await readJson<{ roomId?: string; participantId?: string }>(request);
  const roomId = String(body.roomId || '').trim().toUpperCase();
  const participantId = String(body.participantId || '').trim();
  if (!roomId || !participantId) return json(request, env, { error: 'roomId and participantId are required' }, 400);

  const participant = await env.DB.prepare(
    'SELECT is_host FROM watch_party_participants WHERE room_id = ? AND participant_id = ?'
  ).bind(roomId, participantId).first<{ is_host: number }>();

  if (!participant) return json(request, env, { ok: true, roomClosed: false });

  if (participant.is_host === 1) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM watch_party_participants WHERE room_id = ?').bind(roomId),
      env.DB.prepare('DELETE FROM watch_party_rooms WHERE id = ?').bind(roomId),
    ]);
    return json(request, env, { ok: true, roomClosed: true });
  }

  await env.DB.prepare(
    'DELETE FROM watch_party_participants WHERE room_id = ? AND participant_id = ?'
  ).bind(roomId, participantId).run();

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM watch_party_participants WHERE room_id = ?'
  ).bind(roomId).first<{ count: number }>();

  const count = Number(countRow?.count || 0);
  if (count <= 0) {
    await env.DB.prepare('DELETE FROM watch_party_rooms WHERE id = ?').bind(roomId).run();
    return json(request, env, { ok: true, roomClosed: true });
  }

  await env.DB.prepare(
    'UPDATE watch_party_rooms SET participant_count = ?, updated_at = ? WHERE id = ?'
  ).bind(count, new Date().toISOString(), roomId).run();

  return json(request, env, { ok: true, roomClosed: false, participantCount: count });
}

async function handleUserFeedback(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);
  await ensureFeedbackTables(env);
  // Automatic cleanup disabled - threads persist for admins
  // await cleanupExpiredClosedFeedbackThreads(env);

  if (request.method === 'GET') {
    const threads = await env.DB.prepare(
      `SELECT id, category, subject, status, created_at, updated_at, last_reply_at, admin_last_reply_at, user_last_reply_at
       FROM feedback_threads
       WHERE user_id = ?
       ORDER BY datetime(updated_at) DESC
       LIMIT 200`
    ).bind(session.user.id).all<{
      id: string;
      category: string;
      subject: string;
      status: string;
      created_at: string;
      updated_at: string;
      last_reply_at: string;
      admin_last_reply_at: string | null;
      user_last_reply_at: string | null;
    }>();

    return json(request, env, {
      items: (threads.results || []).map((thread) => ({
        id: thread.id,
        category: sanitizeFeedbackCategory(thread.category),
        subject: thread.subject,
        status: sanitizeFeedbackStatus(thread.status),
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
        lastReplyAt: thread.last_reply_at,
        hasAdminReply: Boolean(thread.admin_last_reply_at),
        closedExpiresAt: sanitizeFeedbackStatus(thread.status) === 'closed' ? getClosedFeedbackExpiresAt(thread.updated_at) : undefined,
        closedRemainingMs: sanitizeFeedbackStatus(thread.status) === 'closed' ? getClosedFeedbackRemainingMs(thread.updated_at) : undefined,
      })),
    });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ category?: string; subject?: string; message?: string; turnstileToken?: string }>(request);
    const turnstileToken = (body.turnstileToken || '').trim();
    if ((env.TURNSTILE_SECRET_KEY || '').trim()) {
      const verified = await verifyTurnstileToken(request, env, turnstileToken);
      if (!verified) return json(request, env, { error: 'Captcha verification failed' }, 403);
    }
    const category = sanitizeFeedbackCategory(body.category);
    const subject = sanitizeFeedbackSubject(body.subject);
    const message = sanitizeFeedbackMessage(body.message);

    if (!subject) return json(request, env, { error: 'Subject is required' }, 400);
    if (!message) return json(request, env, { error: 'Message is required' }, 400);

    const now = new Date().toISOString();
    const threadId = crypto.randomUUID();
    const messageId = crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO feedback_threads (id, user_id, category, subject, status, created_at, updated_at, last_reply_at, admin_last_reply_at, user_last_reply_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(threadId, session.user.id, category, subject, 'open', now, now, now, null, now),
      env.DB.prepare(
        `INSERT INTO feedback_messages (id, thread_id, sender_user_id, sender_role, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(messageId, threadId, session.user.id, 'user', message, now),
    ]);

    return json(request, env, { ok: true, id: threadId });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleUserFeedbackMessages(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);
  await ensureFeedbackTables(env);
  // Automatic cleanup disabled - threads persist for admins
  // await cleanupExpiredClosedFeedbackThreads(env);

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const threadId = (url.searchParams.get('threadId') || '').trim();
    if (!threadId) return json(request, env, { error: 'threadId is required' }, 400);

    const owned = await env.DB.prepare('SELECT id, status, updated_at FROM feedback_threads WHERE id = ? AND user_id = ?').bind(threadId, session.user.id).first<{ id: string; status: string; updated_at: string }>();
    if (!owned?.id) return json(request, env, { error: 'Thread not found' }, 404);

    const rows = await env.DB.prepare(
      `SELECT id, sender_role, message, created_at
       FROM feedback_messages
       WHERE thread_id = ?
       ORDER BY datetime(created_at) ASC`
    ).bind(threadId).all<{ id: string; sender_role: string; message: string; created_at: string }>();

    return json(request, env, {
      thread: {
        id: owned.id,
        status: sanitizeFeedbackStatus(owned.status),
        closedExpiresAt: sanitizeFeedbackStatus(owned.status) === 'closed' ? getClosedFeedbackExpiresAt(owned.updated_at) : undefined,
        closedRemainingMs: sanitizeFeedbackStatus(owned.status) === 'closed' ? getClosedFeedbackRemainingMs(owned.updated_at) : undefined,
      },
      items: (rows.results || []).map((row) => ({
        id: row.id,
        senderRole: row.sender_role,
        message: row.message,
        createdAt: row.created_at,
      })),
    });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ threadId?: string; message?: string }>(request);
    const threadId = (body.threadId || '').trim();
    const message = sanitizeFeedbackMessage(body.message);
    if (!threadId) return json(request, env, { error: 'threadId is required' }, 400);
    if (!message) return json(request, env, { error: 'Message is required' }, 400);

    const owned = await env.DB.prepare('SELECT id, status, updated_at FROM feedback_threads WHERE id = ? AND user_id = ?').bind(threadId, session.user.id).first<{ id: string; status: string; updated_at: string }>();
    if (!owned?.id) return json(request, env, { error: 'Thread not found' }, 404);

    if (sanitizeFeedbackStatus(owned.status) === 'closed') {
      return json(request, env, {
        error: 'This thread is closed. It is archived for 14 days and cannot receive new user messages.',
        closedExpiresAt: getClosedFeedbackExpiresAt(owned.updated_at),
        closedRemainingMs: getClosedFeedbackRemainingMs(owned.updated_at),
      }, 409);
    }

    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO feedback_messages (id, thread_id, sender_user_id, sender_role, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), threadId, session.user.id, 'user', message, now),
      env.DB.prepare(
        `UPDATE feedback_threads
         SET status = ?, updated_at = ?, last_reply_at = ?, user_last_reply_at = ?
         WHERE id = ? AND user_id = ?`
      ).bind('open', now, now, now, threadId, session.user.id),
    ]);

    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleUserNotifications(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);
  await ensureFeedbackTables(env);

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT id, type, title, message, thread_id, is_read, created_at
       FROM user_notifications
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC
       LIMIT 100`
    ).bind(session.user.id).all<{
      id: string;
      type: string;
      title: string;
      message: string;
      thread_id: string | null;
      is_read: number;
      created_at: string;
    }>();

    const items = (rows.results || []).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      threadId: row.thread_id || undefined,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
    }));

    return json(request, env, {
      items,
      unreadCount: items.filter((item) => !item.isRead).length,
    });
  }

  if (request.method === 'PUT') {
    const body = await readJson<{ ids?: string[]; markAllRead?: boolean }>(request);
    const now = new Date().toISOString();
    if (body.markAllRead) {
      await env.DB.prepare('UPDATE user_notifications SET is_read = 1 WHERE user_id = ?').bind(session.user.id).run();
      return json(request, env, { ok: true, updatedAt: now });
    }

    const ids = Array.isArray(body.ids) ? body.ids.map((item) => String(item).trim()).filter(Boolean) : [];
    if (ids.length === 0) return json(request, env, { error: 'No notification ids provided' }, 400);
    const placeholders = ids.map(() => '?').join(', ');
    await env.DB.prepare(
      `UPDATE user_notifications
       SET is_read = 1
       WHERE user_id = ? AND id IN (${placeholders})`
    ).bind(session.user.id, ...ids).run();

    return json(request, env, { ok: true, updatedAt: now });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleClearEverything(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);
  if (request.method !== 'DELETE') return json(request, env, { error: 'Method not allowed' }, 405);

  await ensureFeedbackTables(env);

  const feedbackIds = await env.DB.prepare('SELECT id FROM feedback_threads WHERE user_id = ?').bind(session.user.id).all<{ id: string }>();
  const threadIds = (feedbackIds.results || []).map((row) => row.id);

  const statements = [
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM watchlist WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM user_identifiers WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM user_notifications WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM admin_users WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(session.user.id),
  ];

  for (const threadId of threadIds) {
    statements.push(env.DB.prepare('DELETE FROM feedback_messages WHERE thread_id = ?').bind(threadId));
  }
  statements.push(env.DB.prepare('DELETE FROM feedback_threads WHERE user_id = ?').bind(session.user.id));

  await env.DB.batch(statements);

  return json(request, env, {
    ok: true,
    deleted: {
      account: true,
      settings: true,
      watchlist: true,
      sessions: true,
    },
  });
}

async function requireAdmin(request: Request, env: Env): Promise<SessionUser | Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);
  if (!session.user.isAdmin) return json(request, env, { error: 'Forbidden' }, 403);
  return session;
}

async function requireRole(request: Request, env: Env, allowedRoles: string[]): Promise<SessionUser | Response> {
  const session = await getSessionUser(request, env);
  if (!session) return json(request, env, { error: 'Unauthorized' }, 401);
  if (!session.user.role || !allowedRoles.includes(session.user.role)) {
    return json(request, env, { error: 'Forbidden: Insufficient permissions' }, 403);
  }
  return session;
}

async function handlePublicAnnouncements(request: Request, env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, message, type, link_url, link_label, is_important, updated_at
     FROM announcements
     WHERE is_active = 1
     ORDER BY updated_at DESC
     LIMIT 10`
  ).all<{
    id: string;
    message: string;
    type: AnnouncementType;
    link_url: string | null;
    link_label: string | null;
    is_important: number;
    updated_at: string;
  }>();

  return json(request, env, {
    announcements: (rows.results || []).map((row) => ({
      id: row.id,
      message: row.message,
      type: sanitizeAnnouncementType(row.type),
      link: row.link_url ? { url: row.link_url, label: row.link_label || 'Learn more' } : undefined,
      isImportant: Boolean(row.is_important),
      updatedAt: row.updated_at,
    })),
  });
}

async function handleAdminBlockedMedia(request: Request, env: Env): Promise<Response> {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;

  await ensureBlockedMediaTable(env);

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT tmdb_id, media_type, reason, created_at FROM blocked_media ORDER BY created_at DESC'
    ).all<{ tmdb_id: string; media_type: string; reason: string | null; created_at: string }>();

    return json(request, env, {
      items: (rows.results || []).map((row) => ({
        tmdbId: row.tmdb_id,
        mediaType: row.media_type,
        reason: row.reason,
        createdAt: row.created_at,
      })),
    });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ tmdbId?: string; mediaType?: string; reason?: string }>(request);
    const tmdbId = String(body.tmdbId || '').trim();
    const mediaType = (body.mediaType || 'movie').toLowerCase() === 'tv' ? 'tv' : 'movie';
    const reason = (body.reason || '').trim().slice(0, 300);

    if (!tmdbId) return json(request, env, { error: 'tmdbId is required' }, 400);

    await env.DB.prepare(
      `INSERT INTO blocked_media (tmdb_id, media_type, reason, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tmdb_id, media_type) DO UPDATE SET reason = excluded.reason`
    )
      .bind(tmdbId, mediaType, reason || null, new Date().toISOString())
      .run();

    await writeAdminAuditLog(env, session.user.id, 'block_media', 'media', tmdbId, { mediaType, reason });
    return json(request, env, { ok: true });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const tmdbId = (url.searchParams.get('tmdbId') || '').trim();
    const mediaType = (url.searchParams.get('mediaType') || 'movie').toLowerCase() === 'tv' ? 'tv' : 'movie';

    if (!tmdbId) return json(request, env, { error: 'tmdbId is required' }, 400);

    await env.DB.prepare('DELETE FROM blocked_media WHERE tmdb_id = ? AND media_type = ?').bind(tmdbId, mediaType).run();
    await writeAdminAuditLog(env, session.user.id, 'unblock_media', 'media', tmdbId, { mediaType });
    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handlePublicBlockedMedia(request: Request, env: Env): Promise<Response> {
  await ensureBlockedMediaTable(env);
  const rows = await env.DB.prepare('SELECT tmdb_id, media_type FROM blocked_media').all<{ tmdb_id: string; media_type: string }>();
  return json(request, env, {
    items: (rows.results || []).map((row) => ({
      tmdbId: row.tmdb_id,
      mediaType: row.media_type,
    })),
  });
}

async function handleAdminOverview(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner', 'admin', 'moderator']);
  if (session instanceof Response) return session;

  await ensureSecurityTables(env);

  const [users, activeSessions, bannedUsernames, bannedIps, activeAnnouncements, activeCounts] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?').bind(new Date().toISOString()).first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM banned_usernames').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM banned_ip_hashes').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM announcements WHERE is_active = 1').first<{ count: number }>(),
    getActiveUsersCount(env),
  ]);

  return json(request, env, {
    stats: {
      users: users?.count || 0,
      activeSessions: activeSessions?.count || 0,
      banned: (bannedUsernames?.count || 0) + (bannedIps?.count || 0),
      activeAnnouncements: activeAnnouncements?.count || 0,
      activeUsers: activeCounts.users,
      activeGuests: activeCounts.guests,
    },
    admin: session.user,
  });
}

async function handleAdminBans(request: Request, env: Env): Promise<Response> {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;

  await ensureSecurityTables(env);

  if (request.method === 'GET') {
    const usernameRows = await env.DB.prepare(
      `SELECT username, reason, created_at, created_by_user_id
       FROM banned_usernames
       ORDER BY created_at DESC
       LIMIT 200`
    ).all<{ username: string; reason: string | null; created_at: string; created_by_user_id: string | null }>();

    const ipRows = await env.DB.prepare(
      `SELECT ip_label, reason, created_at, created_by_user_id
       FROM banned_ip_hashes
       ORDER BY created_at DESC
       LIMIT 200`
    ).all<{ ip_label: string; reason: string | null; created_at: string; created_by_user_id: string | null }>();

    const items = [
      ...(usernameRows.results || []).map((row) => ({ type: 'username' as const, value: row.username, reason: row.reason || undefined, created_at: row.created_at })),
      ...(ipRows.results || []).map((row) => ({ type: 'ip' as const, value: row.ip_label, reason: row.reason || undefined, created_at: row.created_at })),
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    return json(request, env, { items });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ type?: 'email' | 'username' | 'ip'; value?: string; reason?: string }>(request);
    const type = body.type || 'username';
    const value = (body.value || '').trim();
    const reason = (body.reason || '').trim().slice(0, 300);
    const now = new Date().toISOString();

    if (type === 'username') {
      if (!isValidUsername(value)) return json(request, env, { error: 'Invalid nickname format' }, 400);
      const username = normalizeUsername(value);

      await env.DB.prepare(
        `INSERT INTO banned_usernames (username, reason, created_at, created_by_user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(username) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at, created_by_user_id = excluded.created_by_user_id`
      ).bind(username, reason || null, now, session.user.id).run();

      const targetUser = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = ?').bind(username).first<{ id: string }>();
      if (targetUser?.id) {
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetUser.id).run();
        const identifiers = await env.DB.prepare('SELECT identifier, id_type FROM user_identifiers WHERE user_id = ?').bind(targetUser.id).all<{ identifier: string; id_type: string }>();
        for (const identifier of identifiers.results || []) {
          await env.DB.prepare(
            `INSERT INTO banned_identifiers (identifier, id_type, reason, created_at, created_by_user_id)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(identifier) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at, created_by_user_id = excluded.created_by_user_id`
          ).bind(identifier.identifier, identifier.id_type, reason || 'Banned user', now, session.user.id).run();
        }
      }

      await writeAdminAuditLog(env, session.user.id, 'ban_username', 'username', username, { reason: reason || null });
      return json(request, env, { ok: true });
    }

    if (type === 'ip') {
      if (!isValidIp(value)) return json(request, env, { error: 'Invalid IP format' }, 400);
      const ipHash = await sha256Hex(`ip:${value}`);

      await env.DB.prepare(
        `INSERT INTO banned_ip_hashes (ip_hash, ip_label, reason, created_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(ip_hash) DO UPDATE SET ip_label = excluded.ip_label, reason = excluded.reason, created_at = excluded.created_at, created_by_user_id = excluded.created_by_user_id`
      ).bind(ipHash, value, reason || null, now, session.user.id).run();

      await env.DB.prepare(
        `INSERT INTO banned_identifiers (identifier, id_type, reason, created_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(identifier) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at, created_by_user_id = excluded.created_by_user_id`
      ).bind(ipHash, 'ip', reason || 'Banned IP', now, session.user.id).run();

      await writeAdminAuditLog(env, session.user.id, 'ban_ip', 'ip', value, { reason: reason || null });
      return json(request, env, { ok: true });
    }

    return json(request, env, { error: 'Unsupported ban type' }, 400);
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const type = (url.searchParams.get('type') || 'username').trim();
    const value = (url.searchParams.get('value') || '').trim();
    if (!value) return json(request, env, { error: 'Missing value' }, 400);

    if (type === 'username') {
      const username = normalizeUsername(value);
      await env.DB.prepare('DELETE FROM banned_usernames WHERE username = ?').bind(username).run();
      const user = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = ?').bind(username).first<{ id: string }>();
      if (user?.id) {
        const identifiers = await env.DB.prepare('SELECT identifier FROM user_identifiers WHERE user_id = ?').bind(user.id).all<{ identifier: string }>();
        for (const identifier of identifiers.results || []) {
          await env.DB.prepare('DELETE FROM banned_identifiers WHERE identifier = ?').bind(identifier.identifier).run();
        }
      }
      await writeAdminAuditLog(env, session.user.id, 'unban_username', 'username', username, null);
      return json(request, env, { ok: true });
    }

    if (type === 'ip') {
      if (!isValidIp(value)) return json(request, env, { error: 'Invalid IP format' }, 400);
      const ipHash = await sha256Hex(`ip:${value}`);
      await env.DB.prepare('DELETE FROM banned_ip_hashes WHERE ip_hash = ?').bind(ipHash).run();
      await env.DB.prepare('DELETE FROM banned_identifiers WHERE identifier = ?').bind(ipHash).run();
      await writeAdminAuditLog(env, session.user.id, 'unban_ip', 'ip', value, null);
      return json(request, env, { ok: true });
    }

    return json(request, env, { error: 'Unsupported ban type' }, 400);
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleAdminAccountLimits(request: Request, env: Env): Promise<Response> {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;

  await ensureSecurityTables(env);

  if (request.method === 'GET') {
    const rows = await env.DB
      .prepare(
        `SELECT type, value, value_label, max_accounts, created_at, updated_at
         FROM account_limit_overrides
         ORDER BY updated_at DESC
         LIMIT 300`
      )
      .all<{ type: 'username' | 'ip'; value: string; value_label: string | null; max_accounts: number; created_at: string; updated_at: string }>();

    return json(request, env, {
      items: (rows.results || []).map((row) => ({
        type: row.type,
        value: row.value_label || row.value,
        maxAccounts: row.max_accounts,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ type?: 'username' | 'ip'; value?: string; maxAccounts?: number }>(request);
    const type = body.type || 'ip';
    const rawValue = (body.value || '').trim();
    const maxAccounts = Math.max(1, Math.min(200, Number(body.maxAccounts || 1)));
    const now = new Date().toISOString();

    if (!rawValue) return json(request, env, { error: 'Value is required' }, 400);

    if (type === 'username') {
      const username = normalizeUsername(rawValue);
      if (!isValidUsername(username)) return json(request, env, { error: 'Invalid nickname format' }, 400);

      await env.DB.prepare(
        `INSERT INTO account_limit_overrides (type, value, value_label, max_accounts, created_at, updated_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(type, value) DO UPDATE SET value_label = excluded.value_label, max_accounts = excluded.max_accounts, updated_at = excluded.updated_at, created_by_user_id = excluded.created_by_user_id`
      ).bind('username', username, username, maxAccounts, now, now, session.user.id).run();

      await writeAdminAuditLog(env, session.user.id, 'set_account_limit_override', 'username', username, { maxAccounts });
      return json(request, env, { ok: true });
    }

    if (!isValidIp(rawValue)) return json(request, env, { error: 'Invalid IP format' }, 400);
    const ipHash = await sha256Hex(`ip:${rawValue}`);

    await env.DB.prepare(
      `INSERT INTO account_limit_overrides (type, value, value_label, max_accounts, created_at, updated_at, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(type, value) DO UPDATE SET value_label = excluded.value_label, max_accounts = excluded.max_accounts, updated_at = excluded.updated_at, created_by_user_id = excluded.created_by_user_id`
    ).bind('ip', ipHash, rawValue, maxAccounts, now, now, session.user.id).run();

    await writeAdminAuditLog(env, session.user.id, 'set_account_limit_override', 'ip', rawValue, { maxAccounts });
    return json(request, env, { ok: true });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const type = (url.searchParams.get('type') || '').trim();
    const rawValue = (url.searchParams.get('value') || '').trim();

    if (type !== 'username' && type !== 'ip') return json(request, env, { error: 'Invalid type' }, 400);
    if (!rawValue) return json(request, env, { error: 'Value is required' }, 400);

    if (type === 'username') {
      const username = normalizeUsername(rawValue);
      await env.DB.prepare('DELETE FROM account_limit_overrides WHERE type = ? AND value = ?').bind('username', username).run();
      await writeAdminAuditLog(env, session.user.id, 'delete_account_limit_override', 'username', username, null);
      return json(request, env, { ok: true });
    }

    if (!isValidIp(rawValue)) return json(request, env, { error: 'Invalid IP format' }, 400);
    const ipHash = await sha256Hex(`ip:${rawValue}`);
    await env.DB.prepare('DELETE FROM account_limit_overrides WHERE type = ? AND value = ?').bind('ip', ipHash).run();
    await writeAdminAuditLog(env, session.user.id, 'delete_account_limit_override', 'ip', rawValue, null);
    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleAdminAccountLookup(request: Request, env: Env): Promise<Response> {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;

  await ensureSecurityTables(env);

  if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const type = (url.searchParams.get('type') || '').trim();
  const rawValue = (url.searchParams.get('value') || '').trim();

  if (type !== 'username' && type !== 'ip') return json(request, env, { error: 'Invalid type' }, 400);
  if (!rawValue) return json(request, env, { error: 'Value is required' }, 400);

  const getAccountsByIpHashes = async (ipHashes: string[]) => {
    if (ipHashes.length === 0) return [] as { id: string; username: string; lastSeenAt: string | null }[];
    const placeholders = ipHashes.map(() => '?').join(', ');
    const rows = await env.DB.prepare(
      `SELECT u.id, u.username, MAX(ui.last_seen_at) AS last_seen_at
       FROM user_identifiers ui
       JOIN users u ON u.id = ui.user_id
       WHERE ui.id_type = 'ip'
         AND ui.identifier IN (${placeholders})
       GROUP BY u.id, u.username
       ORDER BY LOWER(u.username) ASC`
    )
      .bind(...ipHashes)
      .all<{ id: string; username: string; last_seen_at: string | null }>();

    return (rows.results || []).map((row) => ({
      id: row.id,
      username: row.username,
      lastSeenAt: row.last_seen_at,
    }));
  };

  if (type === 'ip') {
    if (!isValidIp(rawValue)) return json(request, env, { error: 'Invalid IP format' }, 400);
    const ipHash = await sha256Hex(`ip:${rawValue}`);
    const accounts = await getAccountsByIpHashes([ipHash]);

    return json(request, env, {
      query: { type: 'ip', value: rawValue },
      accountCount: accounts.length,
      accounts,
    });
  }

  const username = normalizeUsername(rawValue);
  if (!isValidUsername(username)) return json(request, env, { error: 'Invalid nickname format' }, 400);

  const baseUser = await env.DB.prepare('SELECT id, username FROM users WHERE LOWER(username) = ?').bind(username).first<{ id: string; username: string }>();
  if (!baseUser) {
    return json(request, env, {
      query: { type: 'username', value: username },
      accountCount: 0,
      accounts: [],
    });
  }

  const userIpRows = await env.DB.prepare(
    `SELECT DISTINCT identifier
     FROM user_identifiers
     WHERE user_id = ?
       AND id_type = 'ip'
     ORDER BY last_seen_at DESC
     LIMIT 50`
  ).bind(baseUser.id).all<{ identifier: string }>();

  const ipHashes = (userIpRows.results || []).map((row) => row.identifier);
  const accounts = await getAccountsByIpHashes(ipHashes);

  return json(request, env, {
    query: { type: 'username', value: username },
    accountCount: accounts.length,
    ipGroupCount: ipHashes.length,
    accounts,
  });
}

async function handleAdminAnnouncements(request: Request, env: Env): Promise<Response> {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT id, message, type, link_url, link_label, is_active, created_at, updated_at
       FROM announcements
       ORDER BY updated_at DESC
       LIMIT 200`
    ).all<{
      id: string;
      message: string;
      type: AnnouncementType;
      link_url: string | null;
      link_label: string | null;
      is_active: number;
      created_at: string;
      updated_at: string;
    }>();

    return json(request, env, {
      items: (rows.results || []).map((row) => ({
        id: row.id,
        message: row.message,
        type: sanitizeAnnouncementType(row.type),
        linkUrl: row.link_url,
        linkLabel: row.link_label,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ message?: string; type?: string; linkUrl?: string; linkLabel?: string; isActive?: boolean }>(request);
    const message = (body.message || '').trim().slice(0, 500);
    const type = sanitizeAnnouncementType(body.type);
    const linkUrl = sanitizeOptionalHttpUrl(body.linkUrl);
    const linkLabel = (body.linkLabel || '').trim().slice(0, 60);
    const isActive = body.isActive !== false;
    const now = new Date().toISOString();

    if (!message) return json(request, env, { error: 'Message is required' }, 400);
    if (body.linkUrl && !linkUrl) return json(request, env, { error: 'Invalid link URL' }, 400);

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO announcements (id, message, type, link_url, link_label, is_active, created_at, updated_at, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, message, type, linkUrl, linkLabel || null, isActive ? 1 : 0, now, now, session.user.id)
      .run();

    await writeAdminAuditLog(env, session.user.id, 'create_announcement', 'announcement', id, { isActive, type });
    return json(request, env, { ok: true, id });
  }

  if (request.method === 'PUT') {
    const body = await readJson<{ id?: string; message?: string; type?: string; linkUrl?: string; linkLabel?: string; isActive?: boolean }>(request);
    const id = (body.id || '').trim();
    const message = (body.message || '').trim().slice(0, 500);
    const type = sanitizeAnnouncementType(body.type);
    const linkUrl = sanitizeOptionalHttpUrl(body.linkUrl);
    const linkLabel = (body.linkLabel || '').trim().slice(0, 60);
    const isActive = body.isActive !== false;

    if (!id) return json(request, env, { error: 'Announcement id is required' }, 400);
    if (!message) return json(request, env, { error: 'Message is required' }, 400);
    if (body.linkUrl && !linkUrl) return json(request, env, { error: 'Invalid link URL' }, 400);

    await env.DB.prepare(
      `UPDATE announcements
       SET message = ?, type = ?, link_url = ?, link_label = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(message, type, linkUrl, linkLabel || null, isActive ? 1 : 0, new Date().toISOString(), id)
      .run();

    await writeAdminAuditLog(env, session.user.id, 'update_announcement', 'announcement', id, { isActive, type });
    return json(request, env, { ok: true });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();
    if (!id) return json(request, env, { error: 'Announcement id is required' }, 400);

    await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
    await writeAdminAuditLog(env, session.user.id, 'delete_announcement', 'announcement', id, null);
    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleAdminResetPassword(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner']);
  if (session instanceof Response) return session;

  const body = await readJson<{ username: string }>(request);
  const username = normalizeUsername(body.username || '');
  if (!isValidUsername(username)) return json(request, env, { error: 'Invalid nickname format' }, 400);

  const targetUser = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = ?').bind(username).first<{ id: string }>();
  if (!targetUser?.id) return json(request, env, { error: 'User not found' }, 404);

  // Generate 8-char temp password
  const tempPassword = crypto.randomUUID().slice(0, 8);
  const hash = await sha256Hex(tempPassword);

  await env.DB.prepare('UPDATE users SET password_hash = ?, requires_password_change = 1 WHERE id = ?').bind(hash, targetUser.id).run();
  await writeAdminAuditLog(env, session.user.id, 'reset_password', 'user', targetUser.id, { username });

  return json(request, env, { ok: true, temporaryPassword: tempPassword });
}

async function handleAdminUsers(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner', 'admin', 'moderator']);
  if (session instanceof Response) return session;

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT
         u.id,
         u.username,
         u.created_at,
         COALESCE(
           (SELECT MAX(ui.last_seen_at) FROM user_identifiers ui WHERE ui.user_id = u.id),
           (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id),
           u.created_at
         ) AS last_active_at
       FROM users u
       ORDER BY datetime(last_active_at) DESC
       LIMIT 500`
    ).all<{ id: string; username: string; created_at: string; last_active_at: string | null }>();

    return json(request, env, {
      items: (rows.results || []).map((row) => ({
        id: row.id,
        username: row.username,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at || row.created_at,
      })),
    });
  }

  if (request.method === 'DELETE') {
    if (session.user.role !== 'owner' && session.user.role !== 'admin') {
      return json(request, env, { error: 'Forbidden: Insufficient permissions' }, 403);
    }
    const url = new URL(request.url);
    const username = normalizeUsername(url.searchParams.get('username') || '');
    if (!isValidUsername(username)) return json(request, env, { error: 'Invalid nickname format' }, 400);

    if (username === normalizeUsername(session.user.username)) {
      return json(request, env, { error: 'You cannot delete your own account from admin panel' }, 400);
    }

    const row = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = ?').bind(username).first<{ id: string }>();
    if (!row?.id) return json(request, env, { error: 'User not found' }, 404);

    // Hierarchy protection: Admins cannot delete other Admins or Owners
    const targetRole = await getUserRole(env, row.id);
    if (session.user.role === 'admin') {
      if (targetRole === 'admin' || targetRole === 'owner') {
        return json(request, env, { error: 'Admins cannot delete other Admins or Owners' }, 403);
      }
    }

    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.id),
      env.DB.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(row.id),
      env.DB.prepare('DELETE FROM watchlist WHERE user_id = ?').bind(row.id),
      env.DB.prepare('DELETE FROM admin_users WHERE user_id = ?').bind(row.id),
      env.DB.prepare('DELETE FROM user_identifiers WHERE user_id = ?').bind(row.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(row.id),
    ]);

    await writeAdminAuditLog(env, session.user.id, 'delete_user', 'user', row.id, { username });
    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleAdminGrant(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner', 'admin']);
  if (session instanceof Response) return session;

  await ensureSecurityTables(env);

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT a.user_id, u.username, a.role, a.granted_by, a.expires_at, a.created_at
       FROM admin_users a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 100`
    ).all<{ user_id: string; username: string | null; role: string; granted_by: string | null; expires_at: string | null; created_at: string }>();

    return json(request, env, {
      items: (rows.results || []).map((row) => ({
        userId: row.user_id,
        username: row.username || 'unknown',
        role: row.role || 'admin',
        grantedBy: row.granted_by || null,
        expiresAt: row.expires_at || null,
        createdAt: row.created_at,
      })),
    });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ username?: string; role?: string; expiresInDays?: number }>(request);
    const username = normalizeUsername(body.username || '');
    const requestedRole = (body.role || 'moderator').toLowerCase();
    
    if (!['owner', 'admin', 'moderator'].includes(requestedRole)) {
      return json(request, env, { error: 'Invalid role' }, 400);
    }

    // Role hierarchy check
    if (session.user.role === 'admin' && requestedRole !== 'moderator') {
      return json(request, env, { error: 'Admins can only grant Moderator role' }, 403);
    }

    if (!isValidUsername(username)) return json(request, env, { error: 'Invalid nickname format' }, 400);

    const targetUser = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = ?').bind(username).first<{ id: string }>();
    if (!targetUser?.id) return json(request, env, { error: 'User not found' }, 404);

    const existingAdmin = await env.DB.prepare('SELECT user_id, role FROM admin_users WHERE user_id = ?').bind(targetUser.id).first<{ user_id: string; role: string }>();
    if (existingAdmin) {
      if (session.user.role === 'admin') {
        return json(request, env, { error: 'User already has administrative privileges' }, 409);
      }
      // Owners can upgrade/downgrade existing admins
    }

    const now = new Date().toISOString();
    let expiresAt: string | null = null;
    if (body.expiresInDays && body.expiresInDays > 0) {
      const exp = new Date();
      exp.setDate(exp.getDate() + body.expiresInDays);
      expiresAt = exp.toISOString();
    }

    await env.DB.prepare(
      `INSERT INTO admin_users (user_id, role, granted_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, expires_at = excluded.expires_at`
    ).bind(targetUser.id, requestedRole, session.user.id, expiresAt, now).run();

    await writeAdminAuditLog(env, session.user.id, 'grant_admin', 'user', targetUser.id, { username, role: requestedRole, expiresAt });
    return json(request, env, { ok: true });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const userId = (url.searchParams.get('userId') || '').trim();
    if (!userId) return json(request, env, { error: 'Missing userId' }, 400);

    if (userId === session.user.id) {
      return json(request, env, { error: 'You cannot revoke your own admin access' }, 400);
    }

    const target = await env.DB.prepare('SELECT role FROM admin_users WHERE user_id = ?').bind(userId).first<{ role: string }>();
    if (!target) return json(request, env, { error: 'User not found in admin list' }, 404);

    // Permission check for revoking
    if (session.user.role === 'admin') {
      if (target.role !== 'moderator') {
        return json(request, env, { error: 'Admins can only revoke Moderator access' }, 403);
      }
    } else if (session.user.role !== 'owner') {
      return json(request, env, { error: 'Forbidden' }, 403);
    }

    await env.DB.prepare('DELETE FROM admin_users WHERE user_id = ?').bind(userId).run();
    await writeAdminAuditLog(env, session.user.id, 'revoke_admin', 'user', userId, null);
    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleAdminSessions(request: Request, env: Env): Promise<Response> {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;

  if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);

  const now = new Date().toISOString();
  const activeCount = await env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?').bind(now).first<{ count: number }>();

  await env.DB.prepare('DELETE FROM sessions WHERE expires_at > ?').bind(now).run();
  await writeAdminAuditLog(env, session.user.id, 'force_clear_sessions', 'session', '*', { clearedCount: activeCount?.count || 0 });

  return json(request, env, {
    ok: true,
    clearedCount: activeCount?.count || 0,
  });
}

async function handleAdminAuditLogs(request: Request, env: Env): Promise<Response> {
  const session = await requireAdmin(request, env);
  if (session instanceof Response) return session;

  await ensureSecurityTables(env);

  if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);

  const rows = await env.DB.prepare(
    `SELECT id, admin_user_id, action, target_type, target_id, meta_json, created_at
     FROM admin_audit_logs
     ORDER BY datetime(created_at) DESC
     LIMIT 300`
  ).all<{
    id: string;
    admin_user_id: string;
    action: string;
    target_type: string;
    target_id: string | null;
    meta_json: string | null;
    created_at: string;
  }>();

  const adminIds = Array.from(new Set((rows.results || []).map((row) => row.admin_user_id))).filter(Boolean);
  let usernamesById = new Map<string, string>();

  if (adminIds.length > 0) {
    const placeholders = adminIds.map(() => '?').join(', ');
    const users = await env.DB.prepare(
      `SELECT id, username
       FROM users
       WHERE id IN (${placeholders})`
    ).bind(...adminIds).all<{ id: string; username: string }>();

    usernamesById = new Map((users.results || []).map((item) => [item.id, item.username]));
  }

  return json(request, env, {
    items: (rows.results || []).map((row) => {
      let meta: Record<string, unknown> | null = null;
      if (row.meta_json) {
        try {
          meta = JSON.parse(row.meta_json);
        } catch {
          meta = null;
        }
      }

      return {
        id: row.id,
        adminUserId: row.admin_user_id,
        adminUsername: usernamesById.get(row.admin_user_id) || null,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        meta,
        createdAt: row.created_at,
      };
    }),
  });
}

async function handleAdminFeedback(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner', 'admin', 'moderator']);
  if (session instanceof Response) return session;
  await ensureFeedbackTables(env);
  // Automatic cleanup disabled - threads persist for admins
  // await cleanupExpiredClosedFeedbackThreads(env);

  if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);

  const rows = await env.DB.prepare(
    `SELECT
       t.id,
       t.user_id,
       u.username,
       t.category,
       t.subject,
       t.status,
       t.created_at,
       t.updated_at,
       t.last_reply_at,
       t.admin_last_reply_at,
       t.user_last_reply_at
     FROM feedback_threads t
     JOIN users u ON u.id = t.user_id
     ORDER BY datetime(t.updated_at) DESC
     LIMIT 500`
  ).all<{
    id: string;
    user_id: string;
    username: string;
    category: string;
    subject: string;
    status: string;
    created_at: string;
    updated_at: string;
    last_reply_at: string;
    admin_last_reply_at: string | null;
    user_last_reply_at: string | null;
  }>();

  return json(request, env, {
    items: (rows.results || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      category: sanitizeFeedbackCategory(row.category),
      subject: row.subject,
      status: sanitizeFeedbackStatus(row.status),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastReplyAt: row.last_reply_at,
      closedExpiresAt: sanitizeFeedbackStatus(row.status) === 'closed' ? getClosedFeedbackExpiresAt(row.updated_at) : undefined,
      closedRemainingMs: sanitizeFeedbackStatus(row.status) === 'closed' ? getClosedFeedbackRemainingMs(row.updated_at) : undefined,
      hasUnreadFromUser: Boolean(row.user_last_reply_at) && (!row.admin_last_reply_at || Date.parse(row.user_last_reply_at || '') > Date.parse(row.admin_last_reply_at || '1970-01-01T00:00:00.000Z')),
    })),
  });
}

async function handleAdminFeedbackMessages(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner', 'admin', 'moderator']);
  if (session instanceof Response) return session;

  await ensureFeedbackTables(env);
  // Automatic cleanup disabled - threads persist for admins
  // await cleanupExpiredClosedFeedbackThreads(env);

  if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const threadId = (url.searchParams.get('threadId') || '').trim();
  if (!threadId) return json(request, env, { error: 'threadId is required' }, 400);

  const thread = await env.DB.prepare('SELECT id, user_id, status, updated_at FROM feedback_threads WHERE id = ?').bind(threadId).first<{ id: string; user_id: string; status: string; updated_at: string }>();
  if (!thread?.id) return json(request, env, { error: 'Thread not found' }, 404);

  const rows = await env.DB.prepare(
    `SELECT id, sender_user_id, sender_role, message, created_at
     FROM feedback_messages
     WHERE thread_id = ?
     ORDER BY datetime(created_at) ASC`
  ).bind(threadId).all<{ id: string; sender_user_id: string | null; sender_role: string; message: string; created_at: string }>();

  return json(request, env, {
    thread: {
      id: thread.id,
      userId: thread.user_id,
      status: sanitizeFeedbackStatus(thread.status),
      closedExpiresAt: sanitizeFeedbackStatus(thread.status) === 'closed' ? getClosedFeedbackExpiresAt(thread.updated_at || new Date().toISOString()) : undefined,
      closedRemainingMs: sanitizeFeedbackStatus(thread.status) === 'closed' ? getClosedFeedbackRemainingMs(thread.updated_at || new Date().toISOString()) : undefined,
    },
    items: (rows.results || []).map((row) => ({
      id: row.id,
      senderUserId: row.sender_user_id || undefined,
      senderRole: row.sender_role,
      message: row.message,
      createdAt: row.created_at,
    })),
  });
}

async function handleAdminFeedbackReply(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner', 'admin', 'moderator']);
  if (session instanceof Response) return session;
  await ensureFeedbackTables(env);
  // Automatic cleanup disabled - threads persist for admins
  // await cleanupExpiredClosedFeedbackThreads(env);

  if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);

  const body = await readJson<{ threadId?: string; message?: string; status?: string }>(request);
  const threadId = (body.threadId || '').trim();
  const message = sanitizeFeedbackMessage(body.message);
  const status = sanitizeFeedbackStatus(body.status);
  if (!threadId) return json(request, env, { error: 'threadId is required' }, 400);
  if (!message) return json(request, env, { error: 'Message is required' }, 400);

  const thread = await env.DB.prepare('SELECT id, user_id, subject FROM feedback_threads WHERE id = ?').bind(threadId).first<{ id: string; user_id: string; subject: string }>();
  if (!thread?.id) return json(request, env, { error: 'Thread not found' }, 404);

  const now = new Date().toISOString();
  const notificationTitle = 'New admin reply';
  const notificationMessage = `Reply to: ${thread.subject}`.slice(0, 220);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO feedback_messages (id, thread_id, sender_user_id, sender_role, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), threadId, session.user.id, 'admin', message, now),
    env.DB.prepare(
      `UPDATE feedback_threads
       SET status = ?, updated_at = ?, last_reply_at = ?, admin_last_reply_at = ?
       WHERE id = ?`
    ).bind(status, now, now, now, threadId),
    env.DB.prepare(
      `INSERT INTO user_notifications (id, user_id, type, title, message, thread_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), thread.user_id, 'feedback_reply', notificationTitle, notificationMessage, threadId, 0, now),
  ]);

  await writeAdminAuditLog(env, session.user.id, 'reply_feedback_thread', 'feedback_thread', threadId, { status });
  return json(request, env, { ok: true });
}

async function handleAdminFeedbackDelete(request: Request, env: Env): Promise<Response> {
  const session = await requireRole(request, env, ['owner']);
  if (session instanceof Response) return session;
  await ensureFeedbackTables(env);

  if (request.method !== 'DELETE') return json(request, env, { error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const threadId = (url.searchParams.get('threadId') || '').trim();
  if (!threadId) return json(request, env, { error: 'threadId is required' }, 400);

  const thread = await env.DB.prepare('SELECT id FROM feedback_threads WHERE id = ?').bind(threadId).first<{ id: string }>();
  if (!thread?.id) return json(request, env, { error: 'Thread not found' }, 404);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM feedback_messages WHERE thread_id = ?').bind(threadId),
    env.DB.prepare('DELETE FROM user_notifications WHERE thread_id = ?').bind(threadId),
    env.DB.prepare('DELETE FROM feedback_threads WHERE id = ?').bind(threadId),
  ]);

  await writeAdminAuditLog(env, session.user.id, 'force_delete_feedback_thread', 'feedback_thread', threadId, {});
  return json(request, env, { ok: true, deletedThreadId: threadId });
}

/* ──── Route Handlers ──── */

async function handleProxy(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) {
    return json(request, env, { error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);

  // Target URL from query param
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
      status: 400,
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      return json(request, env, { error: 'Invalid target protocol' }, 400);
    }

    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    const hostname = parsedTarget.hostname.toLowerCase();
    if (blockedHosts.includes(hostname) || hostname.endsWith('.internal')) {
      return json(request, env, { error: 'Target host is not allowed' }, 403);
    }

    const allowedHosts = parseCsvSet(env.PROXY_ALLOWED_HOSTS);
    if (allowedHosts.length === 0 || !allowedHosts.some((pattern) => matchHostname(hostname, pattern))) {
      return json(request, env, { error: 'Target host is not in allowlist' }, 403);
    }

    // Build headers for target request
    const requestHeaders = new Headers();

    // Forward special proxy headers
    const headerMappings: Record<string, string> = {
      'X-Cookie': 'Cookie',
      'X-Referer': 'Referer',
      'X-Origin': 'Origin',
      'X-User-Agent': 'User-Agent',
    };

    for (const [proxyHeader, targetHeader] of Object.entries(headerMappings)) {
      const value = request.headers.get(proxyHeader);
      if (value) requestHeaders.set(targetHeader, value);
    }

    // Default User-Agent if not set
    if (!requestHeaders.has('User-Agent')) {
      requestHeaders.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
    }

    // Default Referer and Origin if not set to help with some providers
    if (!requestHeaders.has('Referer')) {
      requestHeaders.set('Referer', parsedTarget.origin + '/');
    }
    if (!requestHeaders.has('Origin')) {
      requestHeaders.set('Origin', parsedTarget.origin);
    }

    // Forward body for POST requests
    let body: BodyInit | null = null;
    if (request.method === 'POST') {
      body = await request.text();
      const contentType = request.headers.get('Content-Type');
      if (contentType) requestHeaders.set('Content-Type', contentType);
    }

    // Make the request to target
    let response = await fetch(targetUrl, {
      method: request.method === 'OPTIONS' ? 'GET' : request.method,
      headers: requestHeaders,
      body,
      redirect: 'follow',
    });

    // Special handling for subtitle providers that are slow/flaky (like sub.wyzie.ru / .io)
    const isSubtitle = /\.(vtt|srt|webvtt|ass|ssa)(\?.*)?$/i.test(parsedTarget.pathname) || 
                       parsedTarget.hostname.includes('wyzie.ru') ||
                       parsedTarget.hostname.includes('wyzie.io');

    if (isSubtitle && (!response.ok || response.status === 204)) {
      // Automatic retry for subtitles to handle "sometimes missing" issues
      // as reported by users (requires refresh to work)
      response = await fetch(targetUrl, {
        method: request.method === 'OPTIONS' ? 'GET' : request.method,
        headers: requestHeaders,
        body,
        redirect: 'follow',
      });
    }

    // Build response headers
    const responseHeaders = new Headers(corsHeaders(request, env));

    // Forward important response headers
    const forwardHeaders = [
      'Content-Type',
      'Content-Length',
      'Content-Disposition',
      'Content-Encoding',
      'Content-Range',
      'Accept-Ranges',
      'Cache-Control',
      'ETag',
      'Last-Modified',
    ];

    for (const header of forwardHeaders) {
      const value = response.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

    // Forward Set-Cookie as X-Set-Cookie
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) responseHeaders.set('X-Set-Cookie', setCookie);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Proxy request failed' }), {
      status: 502,
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    });
  }
}

async function handleHealth(request: Request, env: Env): Promise<Response> {
  return new Response(
    JSON.stringify({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    }),
    {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    }
  );
}

/* ──── Direct Stream Resolver (VidLink) ──── */

const DIRECT_RESOLVER_ALLOWED_HOSTS = [
  '*.vodvidl.site',
  '*.b-cdn.net',
  '*.vidlink.pro',
  '*.workers.dev',
  'videostr.net',
  'vidlink.pro',
];

function isDirectResolverHostAllowed(hostname: string): boolean {
  return DIRECT_RESOLVER_ALLOWED_HOSTS.some((pattern) => matchHostname(hostname, pattern));
}

function parseDirectResolverHeaders(url: URL): Record<string, string> {
  const allowedKeys = new Set(['user-agent', 'referer', 'origin', 'accept', 'accept-language', 'range', 'connection']);
  const result: Record<string, string> = {};

  for (const raw of url.searchParams.getAll('headers')) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        const normalizedKey = key.toLowerCase();
        if (!allowedKeys.has(normalizedKey)) continue;
        if (typeof value !== 'string') continue;
        const trimmed = value.trim();
        if (!trimmed) continue;
        result[normalizedKey] = trimmed;
      }
    } catch {
    }
  }

  const hostHint = String(url.searchParams.get('host') || '').trim();
  if (hostHint) {
    try {
      const parsedHost = new URL(hostHint);
      if (!result.origin) result.origin = parsedHost.origin;
      if (!result.referer) result.referer = `${parsedHost.origin}/`;
    } catch {
    }
  }

  return result;
}

async function handleDirectResolver(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const target = String(url.searchParams.get('url') || '').trim();

  if (!target) {
    return json(request, env, { error: 'Missing ?url= parameter' }, 400);
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    return json(request, env, { error: 'Invalid target URL' }, 400);
  }

  if (!/^https?:$/i.test(parsedTarget.protocol)) {
    return json(request, env, { error: 'Unsupported target protocol' }, 400);
  }

  if (!isDirectResolverHostAllowed(parsedTarget.hostname)) {
    return json(request, env, { error: 'Target host is not allowed' }, 403);
  }

  try {
    const targetHost = parsedTarget.hostname.toLowerCase();
    const defaultOrigin = targetHost.includes('vodvidl') || targetHost.includes('videostr')
        ? 'https://videostr.net'
        : 'https://vidlink.pro';

    const extraHeaders = parseDirectResolverHeaders(url);
    const referer = extraHeaders.referer || `${(extraHeaders.origin || defaultOrigin)}/`;

    const upstreamHeaders = new Headers({
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0',
      Referer: referer,
      Origin: extraHeaders.origin || defaultOrigin,
      Accept: extraHeaders.accept || '*/*',
    });

    for (const [key, value] of Object.entries(extraHeaders)) {
      if (!value) continue;
      if (key === 'accept') continue;
      upstreamHeaders.set(key, value);
    }

    let upstreamResponse = await fetch(new Request(target, {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
    }));

    // Special handling for subtitles - automatic retry if failed or empty
    const isSubtitle = /\.(vtt|srt|webvtt|ass|ssa)(\?.*)?$/i.test(parsedTarget.pathname) ||
                       parsedTarget.hostname.includes('wyzie.ru') ||
                       parsedTarget.hostname.includes('wyzie.io');
    if (isSubtitle && (!upstreamResponse.ok || upstreamResponse.status === 204)) {
      upstreamResponse = await fetch(new Request(target, {
        method: 'GET',
        headers: upstreamHeaders,
        redirect: 'follow',
      }));
    }

    const headers = new Headers(upstreamResponse.headers);
    const allowedOrigin = getAllowedOrigin(request, env);
    headers.set('Access-Control-Allow-Origin', allowedOrigin || '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, Accept, Origin, Referer, User-Agent');
    headers.set('Vary', 'Origin');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  } catch (error: any) {
    return json(request, env, { error: error?.message || 'Direct resolver failed' }, 502);
  }
}

/* ──── HLS Playlist Rewriting ──── */

async function handleHlsProxy(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session) {
    return json(request, env, { error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  const proxyBase = `${url.origin}/proxy?url=`;

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
      status: 400,
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const allowedHosts = parseCsvSet(env.PROXY_ALLOWED_HOSTS);
    if (allowedHosts.length === 0 || !allowedHosts.some((pattern) => matchHostname(parsedTarget.hostname, pattern))) {
      return json(request, env, { error: 'Target host is not in allowlist' }, 403);
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: new URL(targetUrl).origin + '/',
      },
    });

    let body = await response.text();
    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

    // Rewrite relative URLs in HLS manifests to go through proxy
    body = body.replace(/^(?!#)(.+\.(?:m3u8|ts|key|mp4|aac|vtt|srt|webvtt))(\?.*)?$/gm, (match) => {
      if (match.startsWith('http://') || match.startsWith('https://')) {
        return `${proxyBase}${encodeURIComponent(match)}`;
      }
      return `${proxyBase}${encodeURIComponent(baseUrl + match)}`;
    });

    // Rewrite URI= in EXT-X-KEY tags
    body = body.replace(/URI="([^"]+)"/g, (_, uri) => {
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        return `URI="${proxyBase}${encodeURIComponent(uri)}"`;
      }
      return `URI="${proxyBase}${encodeURIComponent(baseUrl + uri)}"`;
    });

    return new Response(body, {
      headers: {
        ...corsHeaders(request, env),
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'HLS proxy failed' }), {
      status: 502,
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    });
  }
}

/* ──── Router ──── */

/* ──── Surveys & Feedback ──── */

async function handleAdminSurveys(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session || !session.user.isAdmin) return json(request, env, { error: 'Unauthorized' }, 401);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM surveys ORDER BY created_at DESC').all();
    const mapped = results.map((s: any) => ({
      ...s,
      questions: typeof s.questions === 'string' ? JSON.parse(s.questions) : s.questions
    }));
    return json(request, env, { surveys: mapped });
  }

  if (request.method === 'POST') {
    const body = await readJson<{ title: string; description?: string; questions: any[] }>(request);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO surveys (id, title, description, questions, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .bind(id, body.title, body.description || '', JSON.stringify(body.questions), now, now)
      .run();
    
    await writeAdminAuditLog(env, session.user.id, 'create_survey', 'survey', id, { title: body.title });
    
    return json(request, env, { ok: true, id });
  }

  if (request.method === 'PATCH') {
    const body = await readJson<{ id: string; isActive: boolean }>(request);
    if (body.isActive) {
      await env.DB.prepare('UPDATE surveys SET is_active = 0').run();
    }
    await env.DB.prepare('UPDATE surveys SET is_active = ?, updated_at = ? WHERE id = ?')
      .bind(body.isActive ? 1 : 0, new Date().toISOString(), body.id)
      .run();

    await writeAdminAuditLog(env, session.user.id, body.isActive ? 'activate_survey' : 'deactivate_survey', 'survey', body.id, null);

    return json(request, env, { ok: true });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json(request, env, { error: 'Missing id' }, 400);
    await env.DB.prepare('DELETE FROM surveys WHERE id = ?').bind(id).run();

    await writeAdminAuditLog(env, session.user.id, 'delete_survey', 'survey', id, null);

    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Method not allowed' }, 405);
}

async function handleAdminSurveyResults(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session || !session.user.isAdmin) return json(request, env, { error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json(request, env, { error: 'Missing id' }, 400);

  const { results } = await env.DB.prepare('SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY created_at DESC').bind(id).all();
  return json(request, env, { responses: results });
}

async function handlePublicSurvey(request: Request, env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT id, title, description, questions FROM surveys WHERE is_active = 1 LIMIT 1').first<{ id: string; title: string; description: string; questions: string }>();
  if (!row) return json(request, env, { survey: null });
  return json(request, env, { survey: { ...row, questions: JSON.parse(row.questions) } });
}

async function handleSurveyRespond(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  const body = await readJson<{ surveyId: string; answers: any }>(request);
  const now = new Date().toISOString();

  await env.DB.prepare('INSERT INTO survey_responses (survey_id, user_id, answers, created_at) VALUES (?, ?, ?, ?)')
    .bind(body.surveyId, session?.user.id || null, JSON.stringify(body.answers), now)
    .run();

  return json(request, env, { ok: true });
}

async function handleAdminCreateChat(request: Request, env: Env): Promise<Response> {
  const session = await getSessionUser(request, env);
  if (!session || !session.user.isAdmin) return json(request, env, { error: 'Unauthorized' }, 401);

  const body = await readJson<{ targetUserId: string; subject: string; message: string }>(request);
  const { targetUserId, subject, message } = body;

  const threadId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO feedback_threads (id, user_id, subject, category, status, created_at, updated_at, last_reply_at, admin_last_reply_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(threadId, targetUserId, subject, 'contact', 'answered', now, now, now, now)
    .run();

  await env.DB.prepare(
    'INSERT INTO feedback_messages (id, thread_id, sender_user_id, sender_role, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), threadId, session.user.id, 'admin', message, now)
    .run();

  await writeAdminAuditLog(env, session.user.id, 'create_chat_thread', 'feedback_thread', threadId, { targetUserId, subject });

  return json(request, env, { ok: true, threadId });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // CORS preflight
      if (request.method === 'OPTIONS') {
        if (request.headers.get('Origin') && !getAllowedOrigin(request, env)) {
          return new Response('CORS origin denied', {
            status: 403,
            headers: { ...corsHeaders(request, env), 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        return new Response(null, {
          headers: corsHeaders(request, env),
        });
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      // Track activity for all requests except health checks and preflights
      if (!['/', '/health'].includes(pathname)) {
        await ensureSecurityTables(env);
        
        if (!request.headers.get('Authorization')) {
          await updateActiveUser(env, request);
        }
      }

      switch (pathname) {
        case '/':
        case '/health':
          return await handleHealth(request, env);
        case '/auth/register':
          if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleRegister(request, env);
        case '/auth/login':
          if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleLogin(request, env);
        case '/auth/change-password':
          if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handlePasswordChange(request, env);
        case '/auth/verify-email':
          if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleVerifyEmail(request, env);
        case '/auth/resend-verification':
          if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleResendVerification(request, env);
        case '/auth/logout':
          if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleLogout(request, env);
        case '/auth/me':
          if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleMe(request, env);
        case '/user/settings':
          if (!['GET', 'PUT'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleSettings(request, env);
        case '/user/watchlist':
          if (!['GET', 'PUT'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleWatchlist(request, env);
        case '/user/profile':
          if (!['PUT'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleProfile(request, env);
        case '/user/clear-everything':
          if (!['DELETE'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleClearEverything(request, env);
        case '/user/feedback':
          if (!['GET', 'POST'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleUserFeedback(request, env);
        case '/user/feedback/messages':
          if (!['GET', 'POST'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleUserFeedbackMessages(request, env);
        case '/user/notifications':
          if (!['GET', 'PUT'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleUserNotifications(request, env);
        case '/watch-party/create':
          if (!['POST'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleWatchPartyCreate(request, env);
        case '/watch-party/join':
          if (!['POST'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleWatchPartyJoin(request, env);
        case '/watch-party/state':
          if (!['GET'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleWatchPartyState(request, env);
        case '/watch-party/update':
          if (!['POST'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleWatchPartyUpdate(request, env);
        case '/watch-party/leave':
          if (!['POST'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleWatchPartyLeave(request, env);
        case '/public/announcements':
          if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handlePublicAnnouncements(request, env);
        case '/admin/overview':
          if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminOverview(request, env);
        case '/admin/blocked-media':
          if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminBlockedMedia(request, env);
        case '/public/blocked-media':
          if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handlePublicBlockedMedia(request, env);
        case '/admin/health':
          return await handleAdminHealth(request, env);
        case '/api/report-error':
        case '/api/report-success':
          return json(request, env, { ok: true });
        case '/admin/bans':          if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminBans(request, env);
        case '/admin/account-limits':
          if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminAccountLimits(request, env);
        case '/admin/account-lookup':
          if (!['GET'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminAccountLookup(request, env);
        case '/admin/announcements':
          if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminAnnouncements(request, env);
        case '/admin/sessions/clear':
          if (!['POST'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminSessions(request, env);
        case '/admin/audit-logs':
          if (!['GET'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminAuditLogs(request, env);
        case '/admin/users':
          if (!['GET', 'DELETE'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminUsers(request, env);
        case '/admin/users/reset-password':
          if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminResetPassword(request, env);
        case '/admin/grant':
          if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminGrant(request, env);
        case '/admin/feedback':
          if (!['GET'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminFeedback(request, env);
        case '/admin/feedback/messages':
          if (!['GET'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminFeedbackMessages(request, env);
        case '/admin/feedback/reply':
          if (!['POST'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminFeedbackReply(request, env);
        case '/admin/feedback/thread':
          if (!['DELETE'].includes(request.method)) return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminFeedbackDelete(request, env);
        case '/admin/feedback/create-chat':
          if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminCreateChat(request, env);
        case '/admin/surveys':
          return await handleAdminSurveys(request, env);
        case '/admin/surveys/results':
          if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleAdminSurveyResults(request, env);
        case '/public/survey':
          if (request.method !== 'GET') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handlePublicSurvey(request, env);
        case '/public/survey/respond':
          if (request.method !== 'POST') return json(request, env, { error: 'Method not allowed' }, 405);
          return await handleSurveyRespond(request, env);
        case '/proxy':
          return await handleProxy(request, env);
        case '/hls':
          return await handleHlsProxy(request, env);
        case '/direct-resolver':
          return await handleDirectResolver(request, env);
        default:
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
          });
      }
    } catch (error: any) {
      return json(request, env, { error: error?.message || 'Internal server error' }, 500);
    }
  },
};
