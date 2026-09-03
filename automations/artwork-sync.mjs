import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listTracks, openDatabase } from '../packages/database/src/db.mjs';

const dryRun = process.argv.includes('--dry-run');
if (!dryRun) throw new Error('La escritura remota aun no esta habilitada. Usa --dry-run.');

const inbox = resolve('inbox/covers');
const normalize = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const covers = existsSync(inbox) ? readdirSync(inbox).filter((name) => /\.(png|jpe?g|webp)$/i.test(name)) : [];
const tracks = listTracks(openDatabase());
const jobs = tracks.map((track) => {
  const cover = covers.find((name) => normalize(name.replace(/\.[^.]+$/, '')).includes(normalize(track.title)));
  return { trackId: track.id, title: track.title, soundcloudId: track.soundcloud_id, cover: cover || null, action: cover && track.soundcloud_id ? 'ready' : 'skip' };
});
mkdirSync('reports', { recursive: true });
const report = { mode: 'dry-run', createdAt: new Date().toISOString(), jobs };
const path = resolve('reports/artwork-dry-run.json');
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Reporte: ${path}`);
console.log(`Listas: ${jobs.filter((job) => job.action === 'ready').length}; omitidas: ${jobs.filter((job) => job.action === 'skip').length}`);

