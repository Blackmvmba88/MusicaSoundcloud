import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  insertSoundCloudMetricSnapshot,
  listSoundCloudMetricSnapshots,
  openDatabase,
  upsertSoundCloudTrack,
} from '../packages/database/src/db.mjs';
import {
  normalizeSoundCloudTrackMetrics,
  summarizeSoundCloudTrackMetrics,
} from '../packages/metrics/src/soundcloud.mjs';

test('normaliza contadores públicos de SoundCloud sin inventar ausentes', () => {
  const metric = normalizeSoundCloudTrackMetrics({
    id: 123,
    title: 'Roots of Love',
    permalink_url: 'https://soundcloud.com/example/roots-of-love',
    playback_count: 199,
    favoritings_count: 12,
    comment_count: 0,
    reposts_count: 1,
    download_count: 0,
  });

  assert.deepEqual(metric, {
    soundcloudId: '123',
    title: 'Roots of Love',
    url: 'https://soundcloud.com/example/roots-of-love',
    createdAt: null,
    playbackCount: 199,
    likesCount: 12,
    commentCount: 0,
    repostsCount: 1,
    downloadCount: 0,
  });

  const missing = normalizeSoundCloudTrackMetrics({ id: 456, title: 'Hidden stats' });
  assert.equal(missing.playbackCount, null);
  assert.equal(missing.likesCount, null);
});

test('resume totales con cobertura explícita', () => {
  const summary = summarizeSoundCloudTrackMetrics([
    { id: 1, playback_count: 10, favoritings_count: 2 },
    { id: 2, playback_count: 20 },
  ]);

  assert.equal(summary.totals.playbackCount, 30);
  assert.equal(summary.coverage.playbackCount.known, 2);
  assert.equal(summary.totals.likesCount, 2);
  assert.equal(summary.coverage.likesCount.known, 1);
});

test('guarda un snapshot idempotente por pista y timestamp', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blackmamba-metrics-'));
  const db = openDatabase(resolve(directory, 'test.sqlite'));
  const track = upsertSoundCloudTrack(db, {
    id: 123,
    title: 'Roots of Love',
    user: { username: 'Iyari Gomez' },
  });
  const capturedAt = '2026-09-15T18:00:00.000Z';

  insertSoundCloudMetricSnapshot(db, {
    trackId: track.id,
    capturedAt,
    playbackCount: 100,
    likesCount: 10,
  });
  insertSoundCloudMetricSnapshot(db, {
    trackId: track.id,
    capturedAt,
    playbackCount: 101,
    likesCount: 11,
  });

  const snapshots = listSoundCloudMetricSnapshots(db, { trackId: track.id });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].playback_count, 101);
  assert.equal(snapshots[0].likes_count, 11);

  db.close();
  rmSync(directory, { recursive: true, force: true });
});
