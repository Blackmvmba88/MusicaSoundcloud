import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { attachLocalPathToSunoTrack, upsertLocalTrack } from '../packages/database/src/db.mjs';
import { resolveSidecarSunoId } from './sidecar-identity.mjs';
import { checkpointAfterMediaScan } from './worker-health.mjs';

const validSunoId = /^[a-zA-Z0-9_-]{6,128}$/;

/** A media alias keeps the original catalog path untouched while providing the worker a usable copy. */
export async function discoverLocalMedia(db, { media, batch }) {
  db.exec("CREATE TABLE IF NOT EXISTS release_worker_media_cursor (" +
    "id INTEGER PRIMARY KEY CHECK(id = 1), last_name TEXT NOT NULL DEFAULT '')");
  db.exec("INSERT OR IGNORE INTO release_worker_media_cursor(id, last_name) VALUES (1, '')");
  db.exec("CREATE TABLE IF NOT EXISTS release_worker_media_aliases (" +
    "media_path TEXT PRIMARY KEY, suno_id TEXT NOT NULL, first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
    "last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  let entries;
  try { entries = await readdir(media, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return { discovered: 0, examined: 0, status: 'media-not-mounted' };
    throw error;
  }
  const files = entries.filter(item => item.isFile() && !item.name.startsWith('._') && /\.wav$/i.test(item.name))
    .map(item => item.name).sort();
  const last = db.prepare('SELECT last_name FROM release_worker_media_cursor WHERE id = 1').get().last_name;
  let selected = files.filter(name => name > last).slice(0, batch);
  if (!selected.length && last) selected = files.slice(0, batch);
  let discovered = 0, failures = 0, aliases = 0;
  let firstFailedIndex = null;
  const getSuno = db.prepare('SELECT * FROM tracks WHERE suno_id = ?');
  const getPath = db.prepare('SELECT id, suno_id FROM tracks WHERE local_path = ?');
  const getAlias = db.prepare('SELECT suno_id FROM release_worker_media_aliases WHERE media_path = ?');
  const insertAlias = db.prepare("INSERT INTO release_worker_media_aliases(media_path, suno_id) VALUES (?, ?) " +
    "ON CONFLICT(media_path) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP " +
    "WHERE suno_id = excluded.suno_id");
  for (const [index, name] of selected.entries()) {
    const file = join(media, name);
    try {
      // Re-evaluate the sidecar on every pass: it may arrive AFTER the WAV.
      let sidecar = {};
      try { sidecar = JSON.parse(await readFile(file + '.suno.json', 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT') throw new Error(`Ficha Suno ilegible o inválida: ${error.message}`);
      }
      const id = resolveSidecarSunoId(sidecar);
      const title = String(sidecar.title || basename(name, extname(name))).trim();
      const pathTrack = getPath.get(file);
      if (validSunoId.test(id)) {
        if (pathTrack?.suno_id && pathTrack.suno_id !== id)
          throw new Error('El mismo WAV tiene una identidad Suno diferente; requiere revisión');
        if (pathTrack && !pathTrack.suno_id) {
          // Late-arriving sidecar links a previously discovered local-only recording.
          attachLocalPathToSunoTrack(db, { sunoId: id, localPath: file,
            title, artist: sidecar.artist || 'Iyari Gomez' });
          discovered++;
        } else if (!pathTrack) {
          const existing = getSuno.get(id);
          if (!existing?.local_path) {
            attachLocalPathToSunoTrack(db, { sunoId: id, localPath: file,
              title, artist: sidecar.artist || 'Iyari Gomez' });
            discovered++;
          } else if (existing.local_path !== file) {
            // Keep source path and create a non-FK alias for the media worker.
            const previous = getAlias.get(file);
            if (previous && previous.suno_id !== id) throw new Error('Alias WAV pertenece a otra canción');
            insertAlias.run(file, id);
            if (!previous) { aliases++; discovered++; }
          }
        }
      } else if (!pathTrack) {
        upsertLocalTrack(db, { localPath: file, title, artist: sidecar.artist || 'Iyari Gomez' });
        discovered++;
      }
    } catch (error) {
      failures++;
      if (firstFailedIndex === null) firstFailedIndex = index;
      process.stderr.write(JSON.stringify({ event: 'media-discovery-error', file: name, message: error.message }) + '\n');
    }
  }
  const nextName = checkpointAfterMediaScan({ startName: last, fileNames: selected, firstFailedIndex });
  db.prepare('UPDATE release_worker_media_cursor SET last_name = ? WHERE id = 1').run(nextName);
  return {
    discovered, aliases, failures, examined: selected.length,
    status: files.length ? 'scanned' : 'empty', lastName: selected.at(-1) || null,
  };
}
