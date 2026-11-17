/**
 * Suno link inbox -> same release-worker SQLite (share token is NOT a song ID).
 * Never fetches Suno or uploads content.
 */
import { readFile } from 'node:fs/promises';

export function parseSunoLink(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('URL de Suno inválida');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('URL de Suno inválida'); }
  if (url.protocol !== 'https:' || !['suno.com', 'www.suno.com'].includes(url.hostname) ||
      url.username || url.password || url.port) throw new Error('Solo se aceptan URLs https de suno.com');
  const match = /^\/(s|song)\/([A-Za-z0-9_-]{6,128})\/?$/.exec(url.pathname);
  if (!match) throw new Error('Ruta de Suno no reconocida: /s/<token> o /song/<id>');
  const kind = match[1] === 's' ? 'share' : 'song';
  const token = match[2];
  return { url: 'https://suno.com/' + match[1] + '/' + token,
    kind, shareToken: kind === 'share' ? token : null,
    sunoId: kind === 'song' ? token : null };
}

export async function importSunoLinks(db, file) {
  let bytes;
  try { bytes = await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { imported: 0, linked: 0, pending: 0, status: 'inbox-not-mounted' };
    throw error;
  }
  const payload = JSON.parse(bytes);
  if (!payload || payload.version !== 1 || !Array.isArray(payload.links))
    throw new Error('Inbox Suno inválido: requiere {version:1,links:[]}');
  const links = payload.links.map(item => parseSunoLink(typeof item === 'string' ? item : item?.url));
  db.exec("CREATE TABLE IF NOT EXISTS release_source_links (" +
    "id INTEGER PRIMARY KEY, source_url TEXT NOT NULL UNIQUE, " +
    "source_kind TEXT NOT NULL CHECK(source_kind IN ('share','song')), " +
    "share_token TEXT, suno_id TEXT, track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL, " +
    "status TEXT NOT NULL DEFAULT 'awaiting_identity' CHECK(status IN ('awaiting_identity','matched')), " +
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, matched_at TEXT)");
  const insert = db.prepare('INSERT OR IGNORE INTO release_source_links(source_url, source_kind, share_token, suno_id) VALUES (?,?,?,?)');
  const lookup = db.prepare('SELECT id FROM tracks WHERE suno_id = ? OR suno_url = ? ORDER BY id LIMIT 1');
  const matched = db.prepare("UPDATE release_source_links SET track_id=?, status='matched', matched_at=CURRENT_TIMESTAMP WHERE id=? AND (track_id IS NULL OR track_id<>?)");
  const rows = db.prepare('SELECT id, source_url, suno_id FROM release_source_links WHERE track_id IS NULL');
  const counts = { imported: 0, linked: 0, pending: 0, status: 'ok' };
  db.exec('SAVEPOINT suno_link_intake');
  try {
    for (const link of links) counts.imported += Number(insert.run(link.url, link.kind, link.shareToken, link.sunoId).changes);
    for (const row of rows.all()) {
      const track = lookup.get(row.suno_id, row.source_url);
      if (track) counts.linked += Number(matched.run(track.id, row.id, track.id).changes);
    }
    counts.pending = db.prepare('SELECT COUNT(*) AS n FROM release_source_links WHERE track_id IS NULL').get().n;
    db.exec('RELEASE SAVEPOINT suno_link_intake');
  } catch (error) {
    db.exec('ROLLBACK TO SAVEPOINT suno_link_intake');
    db.exec('RELEASE SAVEPOINT suno_link_intake');
    throw error;
  }
  return counts;
}
