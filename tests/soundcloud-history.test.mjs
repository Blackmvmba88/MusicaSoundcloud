import assert from 'node:assert/strict';
import test from 'node:test';
import {
  baselineForWindow,
  normalizedWindowDelta,
  summarizeMetricHistory,
} from '../packages/metrics/src/history.mjs';

const rows = [
  {
    captured_at: '2026-08-20T00:00:00.000Z',
    playback_count: 100,
    likes_count: 10,
  },
  {
    captured_at: '2026-09-20T00:00:00.000Z',
    playback_count: 400,
    likes_count: 40,
  },
  {
    captured_at: '2026-09-27T00:00:00.000Z',
    playback_count: 540,
    likes_count: 55,
  },
];

test('elige baseline histórico sin mirar al futuro del window', () => {
  const baseline = baselineForWindow(rows, 7);
  assert.equal(baseline.captured_at, '2026-09-20T00:00:00.000Z');
});

test('calcula delta normalizado de 7 días', () => {
  assert.equal(normalizedWindowDelta(rows, 'playback_count', 7), 140);
});

test('calcula ventana de 30 días usando el snapshot disponible anterior', () => {
  const value = normalizedWindowDelta(rows, 'playback_count', 30);
  // 440 plays over 38 observed days normalized back to 30 days.
  assert.equal(value, 347);
});

test('no inventa velocidad cuando no existe historial suficiente', () => {
  assert.equal(
    normalizedWindowDelta([rows.at(-1)], 'playback_count', 7),
    null,
  );
});

test('resume latest counters y ventanas para MEngine', () => {
  const summary = summarizeMetricHistory(rows);
  assert.equal(summary.playbackCount, 540);
  assert.equal(summary.likesCount, 55);
  assert.equal(summary.plays7d, 140);
  assert.equal(summary.plays30d, 347);
});
