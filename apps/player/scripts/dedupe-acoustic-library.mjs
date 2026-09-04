import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const exec = promisify(execFile);
const root = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(root, 'library.json');
const library = JSON.parse(await readFile(manifestPath, 'utf8'));
const normalize = (title) => title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\(\d+\)$/g, '').replace(/\s+-\s+blackmamba$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
const groups = new Map();
for (const track of library.tracks) { const key = normalize(track.title); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(track); }
const candidates = [...groups.values()].filter((group) => group.length > 1);
const tracks = candidates.flat();
const fingerprints = new Map();
async function fingerprint(track) {
  const file = join(root, track.folder, 'audio.mp3');
  const { stdout } = await exec('fpcalc', ['-raw', '-json', file], { maxBuffer: 20 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  fingerprints.set(track.id, { duration: Number(data.duration), values: data.fingerprint, bytes: (await stat(file)).size });
}
for (let index = 0; index < tracks.length; index += 8) await Promise.all(tracks.slice(index, index + 8).map(fingerprint));
const similarity = (left, right) => {
  if (Math.abs(left.duration - right.duration) > 1.25) return 0;
  const length = Math.min(left.values.length, right.values.length);
  if (!length || Math.abs(left.values.length - right.values.length) > 4) return 0;
  let matchingBits = 0;
  for (let i = 0; i < length; i += 1) { let difference = (left.values[i] ^ right.values[i]) >>> 0; difference -= (difference >>> 1) & 0x55555555; difference = (difference & 0x33333333) + ((difference >>> 2) & 0x33333333); const changed = (((difference + (difference >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; matchingBits += 32 - changed; }
  return matchingBits / (length * 32);
};
const deletedIds = new Set(); const decisions = [];
for (const group of candidates) {
  const clusters = [];
  for (const track of group) { const match = clusters.find((cluster) => similarity(fingerprints.get(cluster[0].id), fingerprints.get(track.id)) >= 0.985); if (match) match.push(track); else clusters.push([track]); }
  for (const cluster of clusters.filter((item) => item.length > 1)) {
    const ranked = [...cluster].sort((a, b) => (Number(b.bitRate || 0) - Number(a.bitRate || 0)) || (fingerprints.get(b.id).bytes - fingerprints.get(a.id).bytes)); const keep = ranked[0];
    for (const remove of ranked.slice(1)) { const score = similarity(fingerprints.get(keep.id), fingerprints.get(remove.id)); await rm(join(root, remove.folder), { recursive: true }); deletedIds.add(remove.id); decisions.push({ keptId: keep.id, keptTitle: keep.title, deletedId: remove.id, deletedTitle: remove.title, similarity: +score.toFixed(5), confidence: score >= 0.995 ? 0.99 : 0.97, evidence: ['Título normalizado coincidente', 'Duración dentro de 1.25 segundos', 'Huella Chromaprint con similitud mínima de 98.5%'], warnings: [], fallbackReason: null }); }
  }
}
library.tracks = library.tracks.filter((track) => !deletedIds.has(track.id)); library.uniqueTracks = library.tracks.length;
library.acousticCleanup = { completedAt: new Date().toISOString(), candidateGroups: candidates.length, candidateTracks: tracks.length, deletedTracks: deletedIds.size, remainingTracks: library.tracks.length, threshold: 0.985, confidence: 0.97, evidence: ['Chromaprint raw fingerprint', 'Duración', 'Título normalizado'], warnings: ['Versiones con huellas distintas se conservaron'], fallbackReason: null };
await writeFile(manifestPath, `${JSON.stringify(library, null, 2)}\n`);
await writeFile(join(root, 'acoustic-cleanup-audit.json'), `${JSON.stringify({ ...library.acousticCleanup, decisions }, null, 2)}\n`);
console.log(JSON.stringify(library.acousticCleanup, null, 2));
