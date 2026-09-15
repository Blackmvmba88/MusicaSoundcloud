import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import {
  insertSoundCloudMetricSnapshot,
  openDatabase,
  upsertSoundCloudTrack,
} from '../packages/database/src/db.mjs';
import { summarizeSoundCloudTrackMetrics } from '../packages/metrics/src/soundcloud.mjs';
import { SoundCloudClient } from '../packages/soundcloud/src/client.mjs';

if (existsSync('.env')) loadEnvFile('.env');
const token = process.env.SOUNDCLOUD_ACCESS_TOKEN || process.env.SOUNDCLOUD_OAUTH_TOKEN;
if (!token) {
  console.error('Falta SOUNDCLOUD_ACCESS_TOKEN en .env. No se realizó ninguna escritura remota.');
  process.exit(2);
}

const capturedAt = new Date().toISOString();
const client = new SoundCloudClient(token);
const me = await client.me();
const remoteTracks = await client.userTracks(me.urn || me.id);
const summary = summarizeSoundCloudTrackMetrics(remoteTracks);
const bySoundCloudId = new Map(summary.tracks.map((track) => [track.soundcloudId, track]));
const db = openDatabase();

for (const remoteTrack of remoteTracks) {
  const localTrack = upsertSoundCloudTrack(db, remoteTrack);
  const metric = bySoundCloudId.get(String(remoteTrack.urn || remoteTrack.id));
  insertSoundCloudMetricSnapshot(db, {
    trackId: localTrack.id,
    capturedAt,
    playbackCount: metric.playbackCount,
    likesCount: metric.likesCount,
    commentCount: metric.commentCount,
    repostsCount: metric.repostsCount,
    downloadCount: metric.downloadCount,
  });
}

db.close();

const report = {
  generatedAt: capturedAt,
  mode: 'read-only',
  source: 'SoundCloud Public API',
  semantics: 'cumulative lifetime counters at capture time; not selected-period Insights',
  account: {
    id: me.id ?? null,
    urn: me.urn || null,
    username: me.username || null,
    permalinkUrl: me.permalink_url || null,
  },
  summary: {
    tracks: remoteTracks.length,
    totals: summary.totals,
    coverage: summary.coverage,
  },
  topTracksByLifetimePlays: summary.topTracksByPlays,
};

mkdirSync('reports', { recursive: true });
const reportPath = resolve('reports/soundcloud-metrics-latest.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Cuenta: ${me.username}`);
console.log(`Snapshot: ${capturedAt}`);
console.log(`Pistas: ${remoteTracks.length}`);
console.log(`Reproducciones acumuladas conocidas: ${summary.totals.playbackCount}`);
console.log(`Reporte: ${reportPath}`);
console.log('Modo read-only: no se modificó SoundCloud.');
