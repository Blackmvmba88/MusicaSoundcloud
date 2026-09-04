import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('doctor entrega un diagnóstico JSON válido sin errores esenciales', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.healthy, true);
  assert.equal(report.counts.errors, 0);
  assert.ok(report.results.some((item) => item.name === 'Regla privada de SoundCloud' && item.level === 'ok'));
  assert.ok(report.results.some((item) => item.name === 'Maestro WAV en USB'));
});
