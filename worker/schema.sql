-- NexVid Cloudflare D1 Complete Schema
-- Combined from root, worker schemas, and hardcoded worker initialization logic.
-- This is the single source of truth for the database structure.

-- 1. Core User & Session Tables
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  requires_password_change INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. Media & Personalization
CREATE TABLE IF NOT EXISTS watchlist (
  user_id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Security, Bans & Anti-Abuse
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_blocked_until ON login_attempts(blocked_until);

CREATE TABLE IF NOT EXISTS user_identifiers (
  user_id TEXT NOT NULL,
  identifier TEXT NOT NULL,
  id_type TEXT NOT NULL,
  device_kind TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, identifier)
);

CREATE INDEX IF NOT EXISTS idx_user_identifiers_identifier ON user_identifiers(identifier);
CREATE INDEX IF NOT EXISTS idx_user_identifiers_type_identifier ON user_identifiers(id_type, identifier);
CREATE INDEX IF NOT EXISTS idx_user_identifiers_last_seen ON user_identifiers(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_user_identifiers_user_type_kind_seen ON user_identifiers(user_id, id_type, device_kind, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS banned_entities (
  ban_type TEXT NOT NULL, -- 'username' | 'identifier'
  ban_value TEXT NOT NULL,
  value_label TEXT,
  id_type TEXT, -- for identifiers, e.g. 'ip'
  target_user_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT,
  PRIMARY KEY (ban_type, ban_value)
);
CREATE INDEX IF NOT EXISTS idx_banned_entities_type_created ON banned_entities(ban_type, id_type, created_at DESC);

CREATE TABLE IF NOT EXISTS account_limit_overrides (
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT,
  max_accounts INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_user_id TEXT,
  PRIMARY KEY (type, value)
);

-- 4. Admin, Auditing & Communication
CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'admin',
  granted_by TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  link_url TEXT,
  link_label TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_user_id TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_active_updated ON announcements(is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS active_users (
  user_id TEXT PRIMARY KEY,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_active_users_last_seen ON active_users(last_seen_at);

-- 5. Surveys & Feedback
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  questions TEXT NOT NULL, -- JSON array of question objects
  is_active INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  answers TEXT NOT NULL, -- JSON object of answers {questionId: answer}
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_surveys_active ON surveys(is_active);
CREATE INDEX IF NOT EXISTS idx_surveys_archived_active ON surveys(is_archived, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_survey ON survey_responses(survey_id);

CREATE TABLE IF NOT EXISTS feedback_threads (
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
);

CREATE INDEX IF NOT EXISTS idx_feedback_threads_user ON feedback_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_threads_status ON feedback_threads(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS feedback_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_user_id TEXT,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread ON feedback_messages(thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  thread_id TEXT,
  is_read INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, is_read, created_at DESC);

-- 6. Blocked Content
CREATE TABLE IF NOT EXISTS blocked_media (
  tmdb_id TEXT NOT NULL,
  media_type TEXT NOT NULL, -- 'movie' or 'tv'
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tmdb_id, media_type)
);

-- 7. Social / Watch Party
CREATE TABLE IF NOT EXISTS watch_party_rooms (
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
);

CREATE INDEX IF NOT EXISTS idx_watch_party_rooms_expires ON watch_party_rooms(expires_at);

CREATE TABLE IF NOT EXISTS watch_party_participants (
  room_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  is_host INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (room_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_party_participants_room ON watch_party_participants(room_id, last_seen_at DESC);

-- 8. AI Limits
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL, -- Format YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
