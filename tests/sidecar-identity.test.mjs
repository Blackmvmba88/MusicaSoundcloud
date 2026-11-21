import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSidecarSunoId } from '../automations/sidecar-identity.mjs';
import { openDatabase } from '../packages/database/src/db.mjs';
import { scanOnce } from '../automations/release-worker.mjs';

const A = 'aabbccdd-1111-4444-8888-123456789abc';
const B = 'bbbbcccc-2222-4444-9999-123456789abc';

test('identidad Suno: id, sunoId y ambos iguales son aceptados', () => {
  assert.equal(resolveSidecarSunoId({ id: A }, { expectedId: A }), A);
  assert.equal(resolveSidecarSunoId({ sunoId: A }, { expectedId: A }), A);
  assert.equal(resolveSidecarSunoId({ id: A, sunoId: A }, { expectedId: A }), A);
});

test('identidad Suno: discrepancia, ausencia y contradicción impiden vincular', () => {
  assert.throws(() => resolveSidecarSunoId({ id: A, sunoId: B }), /contradictorias/);
  assert.throws(() => resolveSidecarSunoId({ id: B }, { expectedId: A }), /canónica/);
  assert.throws(() => resolveSidecarSunoId({}, { expectedId: A }), /no declara/);
  assert.equal(resolveSidecarSunoId({}), null); // WAV local sin identidad confirmada
});

test('identidad Suno: valores inválidos no se convierten en identificadores', () => {
  assert.throws(() => resolveSidecarSunoId({ id: 'abc' }), /inválido/);
  assert.throws(() => resolveSidecarSunoId({ sunoId: 123456 }), /no es texto/);
  assert.throws(() => resolveSidecarSunoId([]), /objeto JSON/);
});

test('worker no declara ready_for_review con una ficha de otra canción', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-sidecar-identity-'));
  const media = join(root, 'media'); mkdirSync(media);
  const audio = join(media, 'master.wav');
  const wav = Buffer.alloc(60); wav.write('RIFF', 0); wav.write('WAVE', 8);
  writeFileSync(audio, wav);
  const cover = Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(cover);
  cover.writeUInt32BE(64, 16); cover.writeUInt32BE(64, 20);
  writeFileSync(join(media, 'cover.png'), cover);
  const metadata = {
    title: 'Pista canónica', artist: 'Iyari Gomez', recordLabel: 'BlackMamba RECORDS',
    metadataStatus: 'ready', instrumental: true, coverStatus: 'ready', coverPath: 'cover.png',
  };
  const db = openDatabase(join(root, 'music.sqlite'));
  try {
    db.prepare('INSERT INTO tracks(title, artist, suno_id, local_path) VALUES (?, ?, ?, ?)')
      .run('Pista canónica', 'Iyari Gomez', A, audio);
    const config = { media, batch: 10, sourcePrefix: '/Volumes/Music',
      catalog: join(root, 'not-mounted.json'), links: join(root, 'no-links.json') };
    for (const conflicting of [{ id: B }, {}, { id: A, sunoId: B }]) {
      writeFileSync(audio + '.suno.json', JSON.stringify({ ...metadata, ...conflicting }));
      await scanOnce(db, config);
      assert.equal(db.prepare('SELECT state FROM release_jobs').get().state, 'preparing');
      assert.equal(db.prepare('SELECT readiness FROM release_jobs').get().readiness, 'incomplete');
      assert.equal(db.prepare('SELECT code FROM release_blockers').get().code, 'METADATA_INCOMPLETE');
    }
    writeFileSync(audio + '.suno.json', JSON.stringify({ ...metadata, id: A }));
    await scanOnce(db, config);
    assert.equal(db.prepare('SELECT state FROM release_jobs').get().state, 'ready_for_review');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});
