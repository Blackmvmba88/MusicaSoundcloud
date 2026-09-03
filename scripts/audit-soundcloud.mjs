import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { openDatabase, upsertSoundCloudTrack } from '../packages/database/src/db.mjs';
import { SoundCloudClient } from '../packages/soundcloud/src/client.mjs';

if (existsSync('.env')) loadEnvFile('.env');
const token = process.env.SOUNDCLOUD_ACCESS_TOKEN || process.env.SOUNDCLOUD_OAUTH_TOKEN;
if (!token) {
  console.error('Falta SOUNDCLOUD_ACCESS_TOKEN en .env. No se realizo ninguna escritura remota.');
  process.exit(2);
}

const client = new SoundCloudClient(token);
const me = await client.me();
const remoteTracks = await client.userTracks(me.urn || me.id);
const db = openDatabase();

const fieldRules = {
  title: (track) => Boolean(track.title?.trim()),
  artist: (track) => Boolean(track.metadata_artist?.trim() || track.user?.username?.trim()),
  genre: (track) => Boolean(track.genre?.trim()),
  tags: (track) => Boolean(track.tag_list?.trim()),
  description: (track) => Boolean(track.description?.trim()),
  artwork: (track) => Boolean(track.artwork_url),
};

const tracks = remoteTracks.map((track) => {
  const missing = Object.entries(fieldRules).filter(([, valid]) => !valid(track)).map(([field]) => field);
  upsertSoundCloudTrack(db, track);
  return {
    id: track.id ?? null,
    urn: track.urn || (track.id ? `soundcloud:tracks:${track.id}` : null),
    title: track.title || null,
    url: track.permalink_url || null,
    missing,
    complete: missing.length === 0,
    current: {
      artist: track.metadata_artist || track.user?.username || null,
      genre: track.genre || null,
      tags: track.tag_list || null,
      description: track.description || null,
      artworkUrl: track.artwork_url || null,
    },
  };
});
db.close();

const counts = Object.keys(fieldRules).reduce((result, field) => {
  result[field] = tracks.filter((track) => track.missing.includes(field)).length;
  return result;
}, {});
const report = {
  generatedAt: new Date().toISOString(),
  mode: 'read-only',
  account: { id: me.id, urn: me.urn || null, username: me.username, permalinkUrl: me.permalink_url },
  summary: { total: tracks.length, complete: tracks.filter((track) => track.complete).length, incomplete: tracks.filter((track) => !track.complete).length, missingByField: counts },
  tracks,
};
mkdirSync('reports', { recursive: true });
const reportPath = resolve('reports/soundcloud-metadata-audit.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Cuenta: ${me.username}`);
console.log(`Pistas: ${report.summary.total}; incompletas: ${report.summary.incomplete}`);
console.log(`Reporte: ${reportPath}`);
