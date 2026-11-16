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
