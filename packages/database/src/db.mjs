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
  return db;
}

export function listTracks(db) {
  return db.prepare('SELECT * FROM tracks ORDER BY artist, title').all();
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
