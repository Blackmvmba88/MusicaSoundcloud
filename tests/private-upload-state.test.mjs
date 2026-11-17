import assert from 'node:assert/strict';
import test from 'node:test';
import { existingUpload, markUploadPending, markUploadUncertain, validateUploadState } from '../packages/pipeline/src/private-upload-state.mjs';

const hash = 'a'.repeat(64);
test('checkpoint válido acepta estado v1 y rechaza estado corrupto', () => {
  const valid = { version: 1, rule: 'private-only', baselineCreatedAt: null, files: {} };
  assert.equal(validateUploadState(valid), valid);
  for (const invalid of [null, {}, { ...valid, files: null }, { ...valid, files: [] }, { ...valid, rule: 'public' }]) {
    assert.throws(() => validateUploadState(invalid), /inválido/);
  }
});

test('no reintenta un envío pendiente o incierto aunque cambie la ruta WAV', () => {
  for (const status of ['uploading', 'uncertain']) {
    const files = { '/old.wav': { sha256: hash, status } };
    assert.deepEqual(existingUpload(files, '/new.wav', hash), {
      status: 'needs-reconciliation', matchedFile: '/old.wav', soundcloudUrl: null,
    });
  }
});

test('detecta WAV subido por hash y prioriza el estado incierto', () => {
  const files = {
    '/done.wav': { sha256: hash, status: 'uploaded', soundcloudUrl: 'https://soundcloud.com/test' },
  };
  assert.equal(existingUpload(files, '/renamed.wav', hash).status, 'duplicate');
  files['/uncertain.wav'] = { sha256: hash, status: 'uncertain' };
  assert.equal(existingUpload(files, '/renamed.wav', hash).status, 'needs-reconciliation');
  assert.equal(existingUpload(files, '/other.wav', 'b'.repeat(64)), null);
});

test('preparar y bloquear envío incierto no expone detalles del error', () => {
  const pending = markUploadPending({ sha256: hash, title: 'Canario' }, '2026-11-17T00:00:00Z');
  assert.equal(pending.status, 'uploading');
  assert.equal(pending.sharing, 'private');
  const uncertain = markUploadUncertain(pending, { status: 504, message: 'private token' }, '2026-11-17T00:01:00Z');
  assert.equal(uncertain.status, 'uncertain');
  assert.equal(uncertain.uploadErrorCode, 'http-504');
  assert.doesNotMatch(JSON.stringify(uncertain), /private token/);
});
