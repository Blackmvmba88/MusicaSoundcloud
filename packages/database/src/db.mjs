import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const defaultDatabasePath = resolve(here, '../../../storage/database/music.sqlite');

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
    suno_id: 'TEXT',
    suno_url: 'TEXT',
    suno_snapshot: 'TEXT',
    suno_observed_at: 'TEXT',
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
  const title = String(track.title || '').trim().slice(0, 300) || `Suno ${sunoId.slice(0, 8)}`;
  const artist = String(track.artist || 'Iyari Gomez').trim().slice(0, 200) || 'Iyari Gomez';
  const sunoUrl = `https://suno.com/song/${sunoId}`;
  const observedAt = Number.isNaN(Date.parse(track.observedAt || '')) ? new Date().toISOString() : new Date(track.observedAt).toISOString();
  const snapshot = JSON.stringify({
    id: sunoId,
    title,
    artist,
    url: sunoUrl,
    observedAt,
    source: track.source || 'suno-web',
    page: track.page || null,
  });

  db.prepare(`
    INSERT INTO tracks (title, artist, suno_id, suno_url, suno_snapshot, suno_observed_at, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
    ON CONFLICT(suno_id) DO UPDATE SET
      title = CASE WHEN excluded.title != '' THEN excluded.title ELSE tracks.title END,
      artist = CASE WHEN excluded.artist != '' THEN excluded.artist ELSE tracks.artist END,
      suno_url = excluded.suno_url,
      suno_snapshot = excluded.suno_snapshot,
      suno_observed_at = MIN(COALESCE(tracks.suno_observed_at, excluded.suno_observed_at), excluded.suno_observed_at),
      updated_at = CURRENT_TIMESTAMP
  `).run(title, artist, sunoId, sunoUrl, snapshot, observedAt);
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
  if (pathTrack && pathTrack.id !== existing.id) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM tracks WHERE id = ?').run(existing.id);
      db.prepare(`
        UPDATE tracks
        SET suno_id = ?,
            suno_url = ?,
            suno_snapshot = ?,
            suno_observed_at = ?,
            title = COALESCE(NULLIF(?, ''), title),
            artist = COALESCE(NULLIF(?, ''), artist),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(normalizedId, existing.suno_url, existing.suno_snapshot, existing.suno_observed_at, title || '', artist || '', pathTrack.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return db.prepare('SELECT * FROM tracks WHERE id = ?').get(pathTrack.id);
  }

  db.prepare(`
    UPDATE tracks
    SET local_path = ?,
        title = COALESCE(NULLIF(?, ''), title),
        artist = COALESCE(NULLIF(?, ''), artist),
        sync_status = CASE WHEN soundcloud_id IS NOT NULL THEN 'linked' ELSE 'local' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE suno_id = ?
  `).run(localPath, title || '', artist || '', normalizedId);
  return db.prepare('SELECT * FROM tracks WHERE suno_id = ?').get(normalizedId);
}

export function upsertSoundCloudTrack(db, track) {
  const soundcloudId = String(track.urn || track.id);
  db.prepare(`
    INSERT INTO tracks (
      title, artist, genre, tag_list, bpm, release_date, description, metadata_artist,
      duration_seconds, soundcloud_id, soundcloud_url, soundcloud_artwork_url,
      soundcloud_snapshot, last_soundcloud_audit_at, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'linked')
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
