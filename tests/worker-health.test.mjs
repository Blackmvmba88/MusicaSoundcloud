import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeWorkerScan, checkWorkerHeartbeat } from '../automations/worker-health.mjs';
import { openDatabase } from '../packages/database/src/db.mjs';
import { scanOnce } from '../automations/release-worker.mjs';

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
