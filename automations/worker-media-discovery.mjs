import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { attachLocalPathToSunoTrack, upsertLocalTrack } from '../packages/database/src/db.mjs';

const validSunoId = /^[a-zA-Z0-9_-]{6,128}$/;

export async function discoverLocalMedia(db, { media, batch }) {
  db.exec(`CREATE TABLE IF NOT EXISTS release_worker_media_cursor (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    last_name TEXT NOT NULL DEFAULT ''
  )`);
  db.exec("INSERT OR IGNORE INTO release_worker_media_cursor(id, last_name) VALUES (1, '')");
  let entries;
  try { entries = await readdir(media, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return { discovered: 0, examined: 0, status: 'media-not-mounted' };
    throw error;
  }
  const files = entries.filter((item) => item.isFile() && !item.name.startsWith('._') && /\.wav$/i.test(item.name))
    .map((item) => item.name).sort();
  const last = db.prepare('SELECT last_name FROM release_worker_media_cursor WHERE id = 1').get().last_name;
  let selected = files.filter((name) => name > last).slice(0, batch);
  if (!selected.length && last) selected = files.slice(0, batch);
  let discovered = 0;
  let failures = 0;
  const getSuno = db.prepare('SELECT * FROM tracks WHERE suno_id = ?');
  const getPath = db.prepare('SELECT 1 FROM tracks WHERE local_path = ?');
  for (const name of selected) {
    const file = join(media, name);
    try {
      if (!getPath.get(file)) {
        let sidecar = {};
        try { sidecar = JSON.parse(await readFile(file + '.suno.json', 'utf8')); }
        catch { /* Sin ficha: registrar como archivo local pendiente. */ }
        const id = String(sidecar.id || sidecar.sunoId || '').trim();
        const title = String(sidecar.title || basename(name, extname(name))).trim();
        if (validSunoId.test(id)) {
          const existing = getSuno.get(id);
          // Nunca cambiar una ruta existente de la SQLite compartida.
          if (!existing?.local_path) {
            attachLocalPathToSunoTrack(db, { sunoId: id, localPath: file, title, artist: sidecar.artist || 'Iyari Gomez' });
            discovered++;
          }
        } else {
          upsertLocalTrack(db, { localPath: file, title, artist: sidecar.artist || 'Iyari Gomez' });
          discovered++;
        }
      }
    } catch (error) {
      failures++;
      process.stderr.write(JSON.stringify({ event: 'media-discovery-error', file: name, message: error.message }) + '\n');
    }
    db.prepare('UPDATE release_worker_media_cursor SET last_name = ? WHERE id = 1').run(name);
  }
  return {
    discovered, failures, examined: selected.length,
    status: files.length ? 'scanned' : 'empty',
    lastName: selected.at(-1) || null,
  };
}
