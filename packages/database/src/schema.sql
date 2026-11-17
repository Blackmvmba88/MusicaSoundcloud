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

-- Los índices de tracks se crean después de migrar columnas heredadas en db.mjs.

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

-- La fusión destructiva anterior podía ejecutar CASCADE sobre relaciones futuras.
-- El procedimiento transaccional de db.mjs conserva alias y bloquea dependencias desconocidas.
DROP TRIGGER IF EXISTS content_merge_local_path_before_update;

CREATE TABLE IF NOT EXISTS artwork_jobs (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'applied', 'skipped', 'error')),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS soundcloud_metric_snapshots (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,
  playback_count INTEGER,
  likes_count INTEGER,
  comment_count INTEGER,
  reposts_count INTEGER,
  download_count INTEGER,
  source TEXT NOT NULL DEFAULT 'public_api' CHECK (source IN ('public_api', 'manual')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(track_id, captured_at)
);

CREATE INDEX IF NOT EXISTS soundcloud_metric_snapshots_track_idx
  ON soundcloud_metric_snapshots(track_id, captured_at);
CREATE INDEX IF NOT EXISTS soundcloud_metric_snapshots_captured_idx
  ON soundcloud_metric_snapshots(captured_at);

-- Auditoría de conciliación: no depende del registro retirado (que deja de existir).
-- El ID canónico se protege contra borrados que invaliden el historial.
CREATE TABLE IF NOT EXISTS track_merge_aliases (
  retired_track_id INTEGER PRIMARY KEY,
  canonical_track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
  retired_snapshot_json TEXT NOT NULL,
  merged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (retired_track_id <> canonical_track_id)
);
CREATE INDEX IF NOT EXISTS track_merge_aliases_canonical_idx
  ON track_merge_aliases(canonical_track_id);

CREATE TABLE IF NOT EXISTS content_merge_aliases (
  retired_content_id INTEGER PRIMARY KEY,
  canonical_content_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
  retired_snapshot_json TEXT NOT NULL,
  merged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (retired_content_id <> canonical_content_id)
);
CREATE INDEX IF NOT EXISTS content_merge_aliases_canonical_idx
  ON content_merge_aliases(canonical_content_id);
