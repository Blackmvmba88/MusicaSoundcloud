import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { listTracks, openDatabase, upsertLocalTrack } from '../packages/database/src/db.mjs';

test('registra una pista local sin duplicarla', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-music-'));
  const db = openDatabase(resolve(directory, 'test.sqlite'));
  upsertLocalTrack(db, { title: 'America', localPath: '/music/america.mp3' });
  upsertLocalTrack(db, { title: 'America nueva', localPath: '/music/america.mp3' });
  const tracks = listTracks(db);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, 'America nueva');
  db.close();
  rmSync(directory, { recursive: true, force: true });
});


test('inicializa una base SQLite nueva con columnas Suno únicas y WAL', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-schema-bootstrap-'));
  let db;
  try {
    db = openDatabase(resolve(directory, 'fresh.sqlite'));
    const columns = db.prepare('PRAGMA table_info(tracks)').all().map((column) => column.name);
    assert.equal(columns.filter((name) => name === 'suno_id').length, 1);
    assert.equal(columns.filter((name) => name === 'suno_url').length, 1);
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('migra una base heredada antes de crear índices y sin perder pistas', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-legacy-schema-'));
  const path = resolve(directory, 'legacy.sqlite');
  let db;
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE tracks (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT 'BlackMamba',
        local_path TEXT UNIQUE
      );
      INSERT INTO tracks (id, title, local_path)
      VALUES (42, 'Cancion heredada', '/music/heredada.wav');
    `);
    legacy.close();

    db = openDatabase(path);
    const row = db.prepare('SELECT * FROM tracks WHERE id = 42').get();
    assert.equal(row.title, 'Cancion heredada');
    assert.equal(row.local_path, '/music/heredada.wav');
    for (const column of ['sync_status', 'suno_id', 'suno_url', 'suno_snapshot', 'suno_observed_at', 'soundcloud_id']) {
      assert.ok(Object.hasOwn(row, column), `falta columna heredada: ${column}`);
    }
    const indexes = new Set(db.prepare('PRAGMA index_list(tracks)').all().map((item) => item.name));
    for (const index of ['tracks_title_idx', 'tracks_sync_status_idx', 'tracks_suno_id_idx', 'tracks_suno_observed_at_idx']) {
      assert.ok(indexes.has(index), `falta índice: ${index}`);
    }
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    db.close();
    db = openDatabase(path); // reapertura idempotente
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tracks').get().count, 1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
