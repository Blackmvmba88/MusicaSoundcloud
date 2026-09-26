import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { attachLocalPathToSunoTrack, listPendingSunoTracks, openDatabase, upsertSunoTrack } from '../packages/database/src/db.mjs';

test('registra una canción de Suno antes de que exista el WAV y luego la enlaza', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-suno-'));
  const db = openDatabase(resolve(directory, 'test.sqlite'));

  const first = upsertSunoTrack(db, {
    id: '12345678-abcd-4321-abcd-1234567890ab',
    title: 'Rola recién creada',
    artist: 'Iyari Gomez',
    observedAt: '2026-09-06T06:00:00.000Z',
    source: 'suno-web',
  });
  assert.equal(first.local_path, null);
  assert.equal(first.sync_status, 'pending');
  assert.equal(listPendingSunoTracks(db).length, 1);

  upsertSunoTrack(db, {
    id: '12345678-abcd-4321-abcd-1234567890ab',
    title: 'Rola recién creada v2',
    observedAt: '2026-09-06T06:00:10.000Z',
  });
  assert.equal(listPendingSunoTracks(db).length, 1);

  const linked = attachLocalPathToSunoTrack(db, {
    sunoId: '12345678-abcd-4321-abcd-1234567890ab',
    localPath: '/Volumes/ADATA SC740/MÚSICA/WAV_MASTER/rola.wav',
    title: 'Rola recién creada v2',
    artist: 'Iyari Gomez',
  });
  assert.equal(linked.local_path, '/Volumes/ADATA SC740/MÚSICA/WAV_MASTER/rola.wav');
  assert.equal(listPendingSunoTracks(db).length, 0);

  db.close();
  rmSync(directory, { recursive: true, force: true });
});
