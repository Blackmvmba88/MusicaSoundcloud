import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const defaultDatabasePath = resolve(here, '../../../storage/database/music.sqlite');
const contentKinds = new Set(['audio', 'image', 'video', 'capture', 'download', 'document', 'archive', 'other']);
const contentStatuses = new Set(['pending', 'local', 'processed', 'published', 'archived', 'error']);

function iso(value) {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

function clean(value, max = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function openDatabase(databasePath = defaultDatabasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
  migrateTracks(db);
  return db;
}

function migrateTracks(db) {
  const existing = new Set(db.prepare('PRAGMA table_info(tracks)').all().map((column) => column.name));
  const columns = {
    genre: 'TEXT',
    tag_list: 'TEXT',
    bpm: 'INTEGER',
    release_date: 'TEXT',
    description: 'TEXT',
    lyrics: 'TEXT',
    metadata_artist: 'TEXT',
    aliases: 'TEXT',
    source: 'TEXT',
    suno_id: 'TEXT',
    suno_url: 'TEXT',
    soundcloud_artwork_url: 'TEXT',
    soundcloud_snapshot: 'TEXT',
    last_soundcloud_audit_at: 'TEXT',
  };
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE tracks ADD COLUMN ${name} ${type}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS tracks_suno_id_idx ON tracks(suno_id) WHERE suno_id IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS tracks_suno_observed_at_idx ON tracks(suno_observed_at)');
}

export function listTracks(db) {
  return db.prepare('SELECT * FROM tracks ORDER BY artist, title').all();
}

export function listPendingSunoTracks(db) {
  return db.prepare(`
    SELECT * FROM tracks
    WHERE suno_id IS NOT NULL AND local_path IS NULL
    ORDER BY COALESCE(suno_observed_at, created_at) DESC
  `).all();
}

export function listContentInbox(db, { status = 'pending', source = null, kind = null, limit = 100 } = {}) {
  const normalizedStatus = status === 'all' ? null : contentStatuses.has(status) ? status : 'pending';
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return db.prepare(`
    SELECT * FROM content_items
    WHERE (? IS NULL OR status = ?)
      AND (? IS NULL OR source = ?)
      AND (? IS NULL OR kind = ?)
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(normalizedStatus, normalizedStatus, source, source, kind, kind, normalizedLimit);
}

export function getContentStats(db) {
  const totals = db.prepare(`
    SELECT status, kind, COUNT(*) AS count
    FROM content_items
    GROUP BY status, kind
    ORDER BY status, kind
  `).all();
  return {
    total: Number(db.prepare('SELECT COUNT(*) AS count FROM content_items').get().count),
    pending: Number(db.prepare("SELECT COUNT(*) AS count FROM content_items WHERE status = 'pending'").get().count),
    groups: totals.map((row) => ({ ...row, count: Number(row.count) })),
  };
}

export function upsertContentEvent(db, event) {
  const source = clean(event.source || 'unknown', 80).toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'unknown';
  const externalId = clean(event.externalId || event.external_id, 256) || null;
  const localPath = event.localPath || event.local_path ? resolve(String(event.localPath || event.local_path)) : null;
  const kind = contentKinds.has(event.kind) ? event.kind : 'other';
  const title = clean(event.title, 300) || null;
  const sourceUrl = clean(event.sourceUrl || event.source_url, 2048) || null;
  const mimeType = clean(event.mimeType || event.mime_type, 160) || null;
  const bytes = Number.isFinite(Number(event.bytes)) && Number(event.bytes) >= 0 ? Math.trunc(Number(event.bytes)) : null;
  const observedAt = iso(event.observedAt || event.observed_at);
  const status = contentStatuses.has(event.status) ? event.status : localPath ? 'local' : 'pending';
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const metadataJson = JSON.stringify(metadata);

  let existing = null;
  if (externalId) existing = db.prepare('SELECT * FROM content_items WHERE source = ? AND external_id = ?').get(source, externalId);
  if (!existing && localPath) existing = db.prepare('SELECT * FROM content_items WHERE local_path = ?').get(localPath);

  if (existing) {
    const firstObservedAt = existing.observed_at && existing.observed_at < observedAt ? existing.observed_at : observedAt;
    db.prepare(`
      UPDATE content_items
      SET external_id = COALESCE(external_id, ?),
          kind = ?,
          title = COALESCE(?, title),
          source_url = COALESCE(?, source_url),
          local_path = COALESCE(?, local_path),
          mime_type = COALESCE(?, mime_type),
          bytes = COALESCE(?, bytes),
          status = CASE
            WHEN status IN ('published', 'archived') THEN status
            WHEN ? = 'local' OR local_path IS NOT NULL OR ? IS NOT NULL THEN 'local'
            ELSE ?
          END,
          observed_at = ?,
          metadata_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(externalId, kind, title, sourceUrl, localPath, mimeType, bytes, status, localPath, status, firstObservedAt, metadataJson, existing.id);
    return db.prepare('SELECT * FROM content_items WHERE id = ?').get(existing.id);
  }

  db.prepare(`
    INSERT INTO content_items (
      source, external_id, kind, title, source_url, local_path, mime_type, bytes,
      status, observed_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(source, externalId, kind, title, sourceUrl, localPath, mimeType, bytes, status, observedAt, metadataJson);
  return db.prepare('SELECT * FROM content_items WHERE id = last_insert_rowid()').get();
}

export function attachContentLocalPath(db, { source, externalId, localPath, kind = 'other', title, mimeType, bytes, metadata = {} }) {
  return upsertContentEvent(db, {
    source,
    externalId,
    localPath,
    kind,
    title,
    mimeType,
    bytes,
    metadata,
    status: 'local',
  });
}

export function upsertLocalTrack(db, { title, artist = 'BlackMamba', localPath }) {
  db.prepare(`
    INSERT INTO tracks (title, artist, local_path)
    VALUES (?, ?, ?)
    ON CONFLICT(local_path) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      updated_at = CURRENT_TIMESTAMP
  `).run(title, artist, localPath);
  return db.prepare('SELECT * FROM tracks WHERE local_path = ?').get(localPath);
}

export function upsertSunoTrack(db, track) {
  const sunoId = String(track.id || track.sunoId || '').trim();
  if (!sunoId || !/^[a-zA-Z0-9_-]{6,128}$/.test(sunoId)) throw new Error('Suno id inválido');
  const title = clean(track.title, 300) || `Suno ${sunoId.slice(0, 8)}`;
  const artist = clean(track.artist || 'Iyari Gomez', 200) || 'Iyari Gomez';
  const sunoUrl = `https://suno.com/song/${sunoId}`;
  const observedAt = iso(track.observedAt);
  const snapshotObject = {
    id: sunoId,
    title,
    artist,
    url: sunoUrl,
    observedAt,
    source: track.source || 'suno-web',
    page: track.page || null,
  };
  const snapshot = JSON.stringify(snapshotObject);
  const existing = db.prepare('SELECT * FROM tracks WHERE suno_id = ?').get(sunoId);

  if (existing) {
    const firstObservedAt = existing.suno_observed_at && existing.suno_observed_at < observedAt ? existing.suno_observed_at : observedAt;
    db.prepare(`
      UPDATE tracks
      SET title = ?, artist = ?, suno_url = ?, suno_snapshot = ?, suno_observed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE suno_id = ?
    `).run(title, artist, sunoUrl, snapshot, firstObservedAt, sunoId);
  } else {
    db.prepare(`
      INSERT INTO tracks (title, artist, suno_id, suno_url, suno_snapshot, suno_observed_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(title, artist, sunoId, sunoUrl, snapshot, observedAt);
  }

  upsertContentEvent(db, {
    source: 'suno',
    externalId: sunoId,
    kind: 'audio',
    title,
    sourceUrl: sunoUrl,
    observedAt,
    metadata: snapshotObject,
  });

  return db.prepare('SELECT * FROM tracks WHERE suno_id = ?').get(sunoId);
}

export function attachLocalPathToSunoTrack(db, { sunoId, localPath, title, artist = 'Iyari Gomez' }) {
  const normalizedId = String(sunoId);
  let existing = db.prepare('SELECT * FROM tracks WHERE suno_id = ?').get(normalizedId);
  if (!existing) {
    upsertSunoTrack(db, { id: normalizedId, title, artist, source: 'suno-sidecar' });
    existing = db.prepare('SELECT * FROM tracks WHERE suno_id = ?').get(normalizedId);
  }

  const pathTrack = db.prepare('SELECT * FROM tracks WHERE local_path = ?').get(localPath);
  let linked;
  if (pathTrack && pathTrack.id !== existing.id) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM tracks WHERE id = ?').run(existing.id);
      db.prepare(`
        UPDATE tracks
        SET suno_id = ?, suno_url = ?, suno_snapshot = ?, suno_observed_at = ?,
            title = COALESCE(NULLIF(?, ''), title), artist = COALESCE(NULLIF(?, ''), artist),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(normalizedId, existing.suno_url, existing.suno_snapshot, existing.suno_observed_at, title || '', artist || '', pathTrack.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    linked = db.prepare('SELECT * FROM tracks WHERE id = ?').get(pathTrack.id);
  } else {
    db.prepare(`
      UPDATE tracks
      SET local_path = ?, title = COALESCE(NULLIF(?, ''), title), artist = COALESCE(NULLIF(?, ''), artist),
          sync_status = CASE WHEN soundcloud_id IS NOT NULL THEN 'linked' ELSE 'local' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE suno_id = ?
    `).run(localPath, title || '', artist || '', normalizedId);
    linked = db.prepare('SELECT * FROM tracks WHERE suno_id = ?').get(normalizedId);
  }

  attachContentLocalPath(db, {
    source: 'suno',
    externalId: normalizedId,
    localPath,
    kind: 'audio',
    title: title || linked?.title,
    metadata: { artist, linkedFrom: 'suno-sidecar' },
  });
  return linked;
}

export function upsertSoundCloudTrack(db, track) {
  const soundcloudId = String(track.urn || track.id);
  db.prepare(`
    INSERT INTO tracks (
      title, artist, genre, tag_list, bpm, release_date, description, metadata_artist,
      duration_seconds, soundcloud_id, soundcloud_url, soundcloud_artwork_url,
      soundcloud_snapshot, last_soundcloud_audit_at, sync_status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'linked', 'soundcloud')
    ON CONFLICT(soundcloud_id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      genre = excluded.genre,
      tag_list = excluded.tag_list,
      bpm = excluded.bpm,
      release_date = excluded.release_date,
      description = excluded.description,
      metadata_artist = excluded.metadata_artist,
      duration_seconds = excluded.duration_seconds,
      soundcloud_url = excluded.soundcloud_url,
      soundcloud_artwork_url = excluded.soundcloud_artwork_url,
      soundcloud_snapshot = excluded.soundcloud_snapshot,
      last_soundcloud_audit_at = CURRENT_TIMESTAMP,
      source = 'soundcloud',
      updated_at = CURRENT_TIMESTAMP
  `).run(
    track.title || 'Sin titulo',
    track.metadata_artist || track.user?.username || 'BlackMamba',
    track.genre || null,
    track.tag_list || null,
    track.bpm || null,
    track.release_date || null,
    track.description || null,
    track.metadata_artist || null,
    typeof track.duration === 'number' ? track.duration / 1000 : null,
    soundcloudId,
    track.permalink_url || null,
    track.artwork_url || null,
    JSON.stringify(track),
  );
  return db.prepare('SELECT * FROM tracks WHERE soundcloud_id = ?').get(soundcloudId);
}

export function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/\\|]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(value) {
  const text = `  ${normalizeSearchText(value)}  `;
  const grams = new Set();
  for (let index = 0; index <= text.length - 3; index += 1) grams.add(text.slice(index, index + 3));
  return grams;
}

function diceSimilarity(a, b) {
  const left = trigrams(a);
  const right = trigrams(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const gram of left) if (right.has(gram)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

function levenshteinSimilarity(a, b) {
  const left = normalizeSearchText(a);
  const right = normalizeSearchText(b);
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function tokenOverlap(a, b) {
  const left = new Set(normalizeSearchText(a).split(' ').filter(Boolean));
  const right = new Set(normalizeSearchText(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits / Math.min(left.size, right.size);
}

function fieldScore(query, value, weight = 1) {
  const q = normalizeSearchText(query);
  const v = normalizeSearchText(value);
  if (!q || !v) return { score: 0, reason: null };
  if (v === q) return { score: 1 * weight, reason: 'exact' };
  if (v.startsWith(q)) return { score: 0.95 * weight, reason: 'prefix' };
  if (v.includes(q) || q.includes(v)) return { score: 0.9 * weight, reason: 'contains' };
  const fuzzy = Math.max(
    diceSimilarity(q, v) * 0.78,
    levenshteinSimilarity(q, v) * 0.72,
    tokenOverlap(q, v) * 0.82,
  ) * weight;
  return { score: fuzzy, reason: fuzzy >= 0.45 ? 'fuzzy' : null };
}

export function searchTracks(db, query, { limit = 30, minScore = 0.28 } = {}) {
  const q = normalizeSearchText(query);
  if (!q) return [];

  const rows = db.prepare('SELECT * FROM tracks').all();
  const results = [];

  for (const track of rows) {
    const aliases = String(track.aliases || '').split(/[|,;\n]+/).map((item) => item.trim()).filter(Boolean);
    const candidates = [
      ['title', track.title, 1],
      ...aliases.map((alias) => ['alias', alias, 0.98]),
      ['artist', track.artist, 0.52],
      ['album', track.album, 0.58],
      ['genre', track.genre, 0.42],
      ['tags', track.tag_list, 0.4],
      ['description', track.description, 0.34],
      ['lyrics', track.lyrics, 0.24],
    ];

    let best = { score: 0, field: null, reason: null, value: null };
    for (const [field, value, weight] of candidates) {
      const match = fieldScore(q, value, weight);
      if (match.score > best.score) best = { ...match, field, value };
    }

    const titleTokenBoost = tokenOverlap(q, track.title) * 0.12;
    const score = Math.min(1, best.score + titleTokenBoost);
    if (score < minScore) continue;

    results.push({
      ...track,
      match_score: Math.round(score * 100),
      match_field: best.field,
      match_reason: best.reason,
      match_value: best.value,
    });
  }

  return results
    .sort((a, b) => b.match_score - a.match_score || String(a.title).localeCompare(String(b.title)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 30, 100)));
}
