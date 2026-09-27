import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../packages/database/src/db.mjs';
import { summarizeMetricHistory } from '../packages/metrics/src/history.mjs';

function remoteCreatedAt(track) {
  try {
    const snapshot = JSON.parse(track.soundcloud_snapshot || '{}');
    return snapshot.created_at || snapshot.createdAt || track.release_date || null;
  } catch {
    return track.release_date || null;
  }
}

const db = openDatabase();
let tracks;
try {
  tracks = db.prepare(`
    SELECT id, title, soundcloud_id, soundcloud_url, soundcloud_snapshot, release_date
    FROM tracks
    WHERE soundcloud_id IS NOT NULL
    ORDER BY title
  `).all();

  const snapshotsForTrack = db.prepare(`
    SELECT captured_at, playback_count, likes_count, comment_count,
           reposts_count, download_count
    FROM soundcloud_metric_snapshots
    WHERE track_id = ?
    ORDER BY captured_at
  `);

  const rows = [];
  for (const track of tracks) {
    const history = snapshotsForTrack.all(track.id);
    const metrics = summarizeMetricHistory(history);
    if (!metrics) continue;

    rows.push({
      soundcloudId: String(track.soundcloud_id),
      title: track.title || null,
      url: track.soundcloud_url || null,
      createdAt: remoteCreatedAt(track),
      capturedAt: metrics.capturedAt,
      playbackCount: metrics.playbackCount,
      likesCount: metrics.likesCount,
      commentCount: metrics.commentCount,
      repostsCount: metrics.repostsCount,
      downloadCount: metrics.downloadCount,
      plays7d: metrics.plays7d,
      plays30d: metrics.plays30d,
    });
  }

  const report = {
    schema: 'blackmamba.soundcloud.mengine-metrics.v1',
    generatedAt: new Date().toISOString(),
    semantics: {
      counters: 'latest cumulative public counters',
      plays7d: 'normalized delta from a snapshot at or before 7 days ago; null when history is insufficient',
      plays30d: 'normalized delta from a snapshot at or before 30 days ago; null when history is insufficient',
    },
    tracks: rows,
  };

  mkdirSync('reports', { recursive: true });
  const output = resolve('reports/soundcloud-mengine-metrics.json');
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output, tracks: rows.length }, null, 2));
} finally {
  db.close();
}
