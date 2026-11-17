-- BlackMamba Music Orchestrator v0.1. Misma SQLite, sin catálogo duplicado.
-- El estado operativo y la completitud son dimensiones independientes.
CREATE TABLE IF NOT EXISTS release_jobs (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
  job_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'detected'
    CHECK (state IN ('detected', 'awaiting_wav', 'preparing', 'ready_for_review', 'approved', 'uploading', 'verifying', 'delivered')),
  readiness TEXT NOT NULL DEFAULT 'incomplete' CHECK (readiness IN ('incomplete', 'complete')),
  package_version INTEGER NOT NULL DEFAULT 0 CHECK (package_version >= 0),
  transition_version INTEGER NOT NULL DEFAULT 0 CHECK (transition_version >= 0),
  next_action TEXT,
  last_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS release_jobs_track_idx ON release_jobs(track_id);
CREATE INDEX IF NOT EXISTS release_jobs_state_idx ON release_jobs(state, readiness);

CREATE TABLE IF NOT EXISTS release_blockers (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES release_jobs(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolution TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, code)
);

-- Auditoría append-only por versión de transición.
CREATE TABLE IF NOT EXISTS release_transitions (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES release_jobs(id) ON DELETE RESTRICT,
  transition_version INTEGER NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(evidence_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, transition_version)
);

-- La huella verifica integridad; identidad requiere evidencia de autorización externa.
CREATE TABLE IF NOT EXISTS release_approvals (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES release_jobs(id) ON DELETE RESTRICT,
  package_version INTEGER NOT NULL,
  manifest_sha256 TEXT NOT NULL
    CHECK (length(manifest_sha256) = 64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  actor_id TEXT NOT NULL,
  authentication_method TEXT NOT NULL,
  authorization_evidence_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, package_version, manifest_sha256)
);

-- Un intento incierto exige conciliación antes de cualquier reenvío.
CREATE TABLE IF NOT EXISTS release_delivery_attempts (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES release_jobs(id) ON DELETE RESTRICT,
  approval_id INTEGER NOT NULL REFERENCES release_approvals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'soundcloud',
  state TEXT NOT NULL DEFAULT 'created'
    CHECK (state IN ('created', 'submitting', 'uncertain', 'verifying', 'verified', 'failed')),
  remote_id TEXT,
  reason TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(evidence_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS release_delivery_attempts_job_idx
  ON release_delivery_attempts(job_id, created_at);

CREATE VIEW IF NOT EXISTS release_job_overview AS
SELECT job.*,
  (SELECT COUNT(*) FROM release_blockers b WHERE b.job_id = job.id) AS blocker_count,
  CASE WHEN EXISTS(SELECT 1 FROM release_blockers b WHERE b.job_id = job.id)
       THEN 1 ELSE 0 END AS blocked
FROM release_jobs job;
