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
  aliases TEXT,
  source TEXT,
  suno_id TEXT,
  suno_url TEXT,
  duration_seconds REAL,
  local_path TEXT UNIQUE,
  artwork_path TEXT,
  suno_id TEXT,
  suno_url TEXT,
  suno_snapshot TEXT,
  suno_observed_at TEXT,
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
CREATE INDEX IF NOT EXISTS tracks_suno_id_idx ON tracks(suno_id);

CREATE TABLE IF NOT EXISTS content_items (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('audio', 'image', 'video', 'capture', 'download', 'document', 'archive', 'other')),
  title TEXT,
  source_url TEXT,
  local_path TEXT,
  mime_type TEXT,
  bytes INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'local', 'processed', 'published', 'archived', 'error')),
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS content_source_external_idx
  ON content_items(source, external_id)
  WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS content_local_path_idx
  ON content_items(local_path)
  WHERE local_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_status_observed_idx
  ON content_items(status, observed_at DESC);
CREATE INDEX IF NOT EXISTS content_source_kind_idx
  ON content_items(source, kind);

-- Si Downloads descubre primero un archivo y luego Suno/u otra fuente reclama esa misma ruta,
-- la identidad remota gana y la observación local redundante se fusiona antes del UNIQUE check.
CREATE TRIGGER IF NOT EXISTS content_merge_local_path_before_update
BEFORE UPDATE OF local_path ON content_items
WHEN NEW.local_path IS NOT NULL
BEGIN
  DELETE FROM content_items
  WHERE local_path = NEW.local_path
    AND id <> OLD.id;
END;

CREATE TABLE IF NOT EXISTS artwork_jobs (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'applied', 'skipped', 'error')),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
