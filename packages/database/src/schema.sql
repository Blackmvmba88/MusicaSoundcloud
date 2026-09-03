PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT 'BlackMamba',
  album TEXT,
  genre TEXT,
  tag_list TEXT,
  bpm INTEGER,
  release_date TEXT,
  description TEXT,
  lyrics TEXT,
  metadata_artist TEXT,
  duration_seconds REAL,
  local_path TEXT UNIQUE,
  artwork_path TEXT,
  soundcloud_id TEXT UNIQUE,
  soundcloud_url TEXT,
  soundcloud_artwork_url TEXT,
  soundcloud_snapshot TEXT,
  last_soundcloud_audit_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN ('local', 'linked', 'pending', 'synced', 'error')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS tracks_title_idx ON tracks(title);
CREATE INDEX IF NOT EXISTS tracks_sync_status_idx ON tracks(sync_status);

CREATE TABLE IF NOT EXISTS artwork_jobs (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'applied', 'skipped', 'error')),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
