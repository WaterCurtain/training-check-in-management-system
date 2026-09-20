CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  workshop TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  start_photo_path TEXT NOT NULL,
  end_photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'training',
  review_status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_member_started_idx ON sessions(member_id, started_at DESC);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  before_data TEXT NOT NULL,
  after_data TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_record_created_idx ON audit_logs(record_id, created_at DESC);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  member_id TEXT,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  content BLOB NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
