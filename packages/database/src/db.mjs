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
