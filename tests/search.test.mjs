import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  normalizeSearchText,
  openDatabase,
  searchTracks,
  upsertLocalTrack,
} from '../packages/database/src/db.mjs';

test('normaliza acentos, signos y espacios', () => {
  assert.equal(normalizeSearchText('  Cada-Caída_2  '), 'cada caida 2');
});

test('encuentra títulos parciales y con error tipográfico', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-search-'));
  const db = openDatabase(resolve(directory, 'test.sqlite'));

  upsertLocalTrack(db, { title: 'Noche Duranguense', localPath: '/music/noche.wav' });
  upsertLocalTrack(db, { title: 'Frequency', localPath: '/music/frequency.wav' });
  upsertLocalTrack(db, { title: 'Kingdom of the Low End', localPath: '/music/kingdom.wav' });

  assert.equal(searchTracks(db, 'durangense')[0].title, 'Noche Duranguense');
  assert.equal(searchTracks(db, 'duranguenze')[0].title, 'Noche Duranguense');
  assert.equal(searchTracks(db, 'frecuency')[0].title, 'Frequency');
  assert.equal(searchTracks(db, 'low end')[0].title, 'Kingdom of the Low End');

  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('usa aliases sin perder la identidad canónica', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-alias-'));
  const db = openDatabase(resolve(directory, 'test.sqlite'));

  const track = upsertLocalTrack(db, { title: 'Cada caída', localPath: '/music/cada-caida.wav' });
  db.prepare('UPDATE tracks SET aliases = ? WHERE id = ?').run('cada caida | la camioneta amarilla', track.id);

  const results = searchTracks(db, 'camioneta amarilla');
  assert.equal(results[0].title, 'Cada caída');
  assert.equal(results[0].match_field, 'alias');

  db.close();
  rmSync(directory, { recursive: true, force: true });
});
