import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  attachContentLocalPath,
  getContentStats,
  listContentInbox,
  openDatabase,
  upsertContentEvent,
  upsertSunoTrack,
} from '../packages/database/src/db.mjs';

test('content inbox deduplica eventos remotos y luego enlaza archivo local', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-content-'));
  const db = openDatabase(resolve(directory, 'test.sqlite'));

  const first = upsertContentEvent(db, {
    source: 'generator',
    externalId: 'img-001',
    kind: 'image',
    title: 'Portada nueva',
    sourceUrl: 'https://example.test/item/img-001',
    observedAt: '2026-09-06T07:00:00.000Z',
  });
  assert.equal(first.status, 'pending');
  assert.equal(first.local_path, null);

  upsertContentEvent(db, {
    source: 'generator',
    externalId: 'img-001',
    kind: 'image',
    title: 'Portada nueva final',
    observedAt: '2026-09-06T07:01:00.000Z',
  });
  assert.equal(listContentInbox(db).length, 1);
  assert.equal(listContentInbox(db)[0].title, 'Portada nueva final');
  assert.equal(listContentInbox(db)[0].observed_at, '2026-09-06T07:00:00.000Z');

  const local = attachContentLocalPath(db, {
    source: 'generator',
    externalId: 'img-001',
    kind: 'image',
    title: 'Portada nueva final',
    localPath: resolve(directory, 'cover.png'),
    bytes: 1024,
  });
  assert.equal(local.status, 'local');
  assert.equal(listContentInbox(db).length, 0);
  assert.equal(listContentInbox(db, { status: 'local' }).length, 1);
  assert.equal(getContentStats(db).total, 1);

  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('fusiona observación del filesystem cuando una fuente remota reclama la misma ruta', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-content-merge-'));
  const db = openDatabase(resolve(directory, 'test.sqlite'));
  const path = resolve(directory, 'same.wav');

  upsertContentEvent(db, {
    source: 'filesystem',
    externalId: 'fs:1:77',
    kind: 'audio',
    title: 'same',
    localPath: path,
    bytes: 2048,
  });
  upsertContentEvent(db, {
    source: 'suno',
    externalId: 'song-777777',
    kind: 'audio',
    title: 'Same Song',
  });
  assert.equal(getContentStats(db).total, 2);

  const merged = attachContentLocalPath(db, {
    source: 'suno',
    externalId: 'song-777777',
    kind: 'audio',
    title: 'Same Song',
    localPath: path,
    bytes: 2048,
  });
  assert.equal(merged.source, 'suno');
  assert.equal(merged.local_path, path);
  assert.equal(getContentStats(db).total, 1);

  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('Suno alimenta también el inbox genérico antes del WAV', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-content-suno-'));
  const db = openDatabase(resolve(directory, 'test.sqlite'));
  upsertSunoTrack(db, {
    id: '12345678-abcd-4321-abcd-1234567890ab',
    title: 'Antes del WAV',
    observedAt: '2026-09-06T07:10:00.000Z',
  });

  const pending = listContentInbox(db, { source: 'suno', kind: 'audio' });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].external_id, '12345678-abcd-4321-abcd-1234567890ab');

  db.close();
  rmSync(directory, { recursive: true, force: true });
});
