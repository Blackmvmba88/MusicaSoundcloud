import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeWorkerScan, checkWorkerHeartbeat } from '../automations/worker-health.mjs';
import { openDatabase } from '../packages/database/src/db.mjs';
import { scanOnce } from '../automations/release-worker.mjs';
import { discoverLocalMedia } from '../automations/worker-media-discovery.mjs';

test('escaneo normal mantiene salud ok', () => {
  assert.deepEqual(summarizeWorkerScan({ mediaScan: { status: 'scanned', failures: 0 } }), {
    errors: 0, trackErrors: 0, mediaFailures: 0, mediaUnavailable: false,
    status: 'ok', errorMessage: null,
  });
});

test('errores de descubrimiento se incorporan al resumen', () => {
  const result = summarizeWorkerScan({ mediaScan: { status: 'scanned', failures: 2 }, trackErrors: 1 });
  assert.equal(result.errors, 3);
  assert.equal(result.status, 'partial');
  assert.match(result.errorMessage, /2 WAV/);
  assert.match(result.errorMessage, /1 pista/);
});

test('volumen faltante degrada salud aunque no existan pistas', () => {
  const result = summarizeWorkerScan({ mediaScan: { status: 'media-not-mounted' } });
  assert.equal(result.mediaUnavailable, true);
  assert.equal(result.errors, 1);
  assert.equal(result.status, 'partial');
});

test('heartbeat rechaza estado parcial o vencido y acepta uno fresco', () => {
  const now = Date.parse('2026-11-17T20:00:00.000Z');
  const heartbeat = { status: 'ok', at: '2026-11-17T19:59:59.000Z' };
  assert.deepEqual(checkWorkerHeartbeat(heartbeat, 60, now), { ok: true, at: heartbeat.at });
  assert.throws(() => checkWorkerHeartbeat({ ...heartbeat, status: 'partial' }, 60, now), /no fue completo/);
  assert.throws(() => checkWorkerHeartbeat({ ...heartbeat, status: 'error' }, 60, now), /no fue completo/);
  assert.throws(() => checkWorkerHeartbeat({ ...heartbeat, at: '2026-11-17T19:00:00.000Z' }, 60, now), /vencido/);
  assert.throws(() => checkWorkerHeartbeat({ ...heartbeat, at: 'nonsense' }, 60, now), /vencido/);
});

test('scanOnce marca volumen no montado y recupera último éxito en SQLite', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-worker-health-'));
  const db = openDatabase(join(root, 'music.sqlite'));
  try {
    const config = { media: join(root, 'media'), batch: 10, sourcePrefix: '/Volumes/Music',
      catalog: join(root, 'none.json'), links: join(root, 'none-links.json') };
    const degraded = await scanOnce(db, config);
    assert.equal(degraded.status, 'partial');
    assert.equal(degraded.mediaUnavailable, true);
    assert.match(db.prepare('SELECT last_error FROM release_worker_runtime WHERE id = 1').get().last_error, /no montado/);
    assert.equal(db.prepare('SELECT last_success_at FROM release_worker_runtime WHERE id = 1').get().last_success_at, null);
    mkdirSync(config.media);
    const restored = await scanOnce(db, config);
    assert.equal(restored.status, 'ok');
    assert.equal(restored.errors, 0);
    const runtime = db.prepare('SELECT last_success_at, last_error FROM release_worker_runtime WHERE id = 1').get();
    assert.ok(runtime.last_success_at);
    assert.equal(runtime.last_error, null);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('ficha Suno corrupta provoca fallo visible sin crear una identidad engañosa', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-worker-bad-sidecar-'));
  const media = join(root, 'media'); mkdirSync(media);
  const path = join(media, 'master.wav');
  const wav = Buffer.alloc(60); wav.write('RIFF', 0); wav.write('WAVE', 8);
  writeFileSync(path, wav);
  writeFileSync(path + '.suno.json', '{id:malformed');
  const db = openDatabase(join(root, 'music.sqlite'));
  try {
    const failed = await discoverLocalMedia(db, { media, batch: 10 });
    assert.equal(failed.failures, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n, 0);
    writeFileSync(path + '.suno.json', JSON.stringify({
      id: 'aabbccdd-1111-4444-8888-123456789abc', title: 'Reconciled',
    }));
    const repaired = await discoverLocalMedia(db, { media, batch: 10 });
    assert.equal(repaired.failures, 0);
    assert.equal(repaired.discovered, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n, 1);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('media cursor retries earliest bad WAV and reports its persisted checkpoint', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-media-checkpoint-'));
  const media = join(root, 'media'); mkdirSync(media);
  for (const name of ['a-bad.wav', 'z-good.wav']) {
    const audio = join(media, name);
    const wav = Buffer.alloc(60); wav.write('RIFF', 0); wav.write('WAVE', 8);
    writeFileSync(audio, wav);
  }
  writeFileSync(join(media, 'a-bad.wav.suno.json'), '{broken-json');
  writeFileSync(join(media, 'z-good.wav.suno.json'), JSON.stringify({
    id: 'bbbbcccc-2222-4444-9999-123456789abc', title: 'Good',
  }));
  const db = openDatabase(join(root, 'music.sqlite'));
  try {
    const first = await discoverLocalMedia(db, { media, batch: 2 });
    assert.equal(first.failures, 1);
    assert.equal(first.discovered, 1);
    assert.equal(first.lastName, null);
    assert.equal(db.prepare('SELECT last_name FROM release_worker_media_cursor WHERE id = 1').get().last_name, '');
    writeFileSync(join(media, 'a-bad.wav.suno.json'), JSON.stringify({
      id: 'aabbccdd-1111-4444-8888-123456789abc', title: 'Repaired',
    }));
    const recovered = await discoverLocalMedia(db, { media, batch: 2 });
    assert.equal(recovered.failures, 0);
    assert.equal(recovered.discovered, 1);
    assert.equal(recovered.lastName, 'z-good.wav');
    assert.equal(db.prepare('SELECT last_name FROM release_worker_media_cursor WHERE id = 1').get().last_name, 'z-good.wav');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n, 2);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('persistent malformed WAV is quarantined without blocking good WAVs and is retried after repair', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-media-quarantine-'));
  const media = join(root, 'media'); mkdirSync(media);
  const bad = join(media, 'a-bad.wav');
  const good = join(media, 'z-good.wav');
  for (const file of [bad, good]) {
    const wav = Buffer.alloc(60); wav.write('RIFF', 0); wav.write('WAVE', 8);
    writeFileSync(file, wav);
  }
  writeFileSync(bad + '.suno.json', '{broken');
  writeFileSync(good + '.suno.json', JSON.stringify({
    id: 'bbbbcccc-2222-4444-9999-123456789abc', title: 'Good',
  }));
  const db = openDatabase(join(root, 'music.sqlite'));
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const report = await discoverLocalMedia(db, { media, batch: 2 });
      assert.equal(report.failures, 1);
      assert.equal(db.prepare('SELECT attempts FROM release_worker_media_failures WHERE media_name=?')
        .get('a-bad.wav').attempts, attempt);
    }
    assert.equal(db.prepare('SELECT last_name FROM release_worker_media_cursor WHERE id=1').get().last_name,
      'z-good.wav');
    const skipped = await discoverLocalMedia(db, { media, batch: 2 });
    assert.equal(skipped.quarantined, 1);
    assert.equal(skipped.failures, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n, 1);

    writeFileSync(bad + '.suno.json', JSON.stringify({
      id: 'aabbccdd-1111-4444-8888-123456789abc', title: 'Repaired',
    }));
    const recovered = await discoverLocalMedia(db, { media, batch: 2 });
    assert.equal(recovered.failures, 0);
    assert.equal(recovered.discovered, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_worker_media_failures').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n, 2);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('sidecar edit with unchanged size and mtime releases logical quarantine', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-suno-content-hash-'));
  const media = join(root, 'media'); mkdirSync(media);
  const wav = join(media, 'bad.wav');
  const audio = Buffer.alloc(60); audio.write('RIFF', 0); audio.write('WAVE', 8);
  writeFileSync(wav, audio);
  const sidecar = wav + '.suno.json';
  // The conflicting IDs and corrected IDs intentionally have identical byte lengths.
  const original = '{"id":"aaaaaaaa-1111-4444-8888-123456789abc","sunoId":"bbbbbbbb-1111-4444-8888-123456789abc"}';
  const fixed = '{"id":"aaaaaaaa-1111-4444-8888-123456789abc","sunoId":"aaaaaaaa-1111-4444-8888-123456789abc"}';
  assert.equal(Buffer.byteLength(original), Buffer.byteLength(fixed));
  writeFileSync(sidecar, original);
  const fixedTime = new Date('2026-11-20T00:00:00.000Z');
  utimesSync(sidecar, fixedTime, fixedTime);
  const db = openDatabase(join(root, 'music.sqlite'));
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const report = await discoverLocalMedia(db, { media, batch: 2 });
      assert.equal(report.failures, 1);
    }
    const quarantined = await discoverLocalMedia(db, { media, batch: 2 });
    assert.equal(quarantined.quarantined, 1);
    const before = statSync(sidecar);
    writeFileSync(sidecar, fixed);
    utimesSync(sidecar, before.atime, before.mtime);
    const after = statSync(sidecar);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
    const recovered = await discoverLocalMedia(db, { media, batch: 2 });
    assert.equal(recovered.failures, 0);
    assert.equal(recovered.discovered, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_worker_media_failures').get().n, 0);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('two WAV files with one canonical Suno ID remain one track after repeated scans', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-suno-alias-idempotent-'));
  const media = join(root, 'media'); mkdirSync(media);
  const id = 'aabbccdd-1111-4444-8888-123456789abc';
  for (const name of ['a-master.wav', 'b-copy.wav']) {
    const file = join(media, name);
    const wav = Buffer.alloc(60); wav.write('RIFF', 0); wav.write('WAVE', 8);
    writeFileSync(file, wav);
    writeFileSync(file + '.suno.json', JSON.stringify({ id, title: 'One canonical song' }));
  }
  const db = openDatabase(join(root, 'music.sqlite'));
  try {
    for (let pass = 0; pass < 3; pass++) {
      const report = await discoverLocalMedia(db, { media, batch: 2 });
      assert.equal(report.failures, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks WHERE suno_id = ?').get(id).n, 1);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_worker_media_aliases WHERE suno_id = ?')
        .get(id).n, 1);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n, 1);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    }
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
