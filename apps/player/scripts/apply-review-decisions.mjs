import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';

const libraryRoot = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(libraryRoot, 'library.json');
const decisionsPath = resolve(process.argv[2] ?? join(homedir(), 'Downloads', 'blackmamba-review-decisions.json'));
const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const library = JSON.parse(await readFile(manifestPath, 'utf8'));
const review = JSON.parse(await readFile(decisionsPath, 'utf8'));

if (!Array.isArray(review.decisions)) throw new Error('El archivo no contiene una lista válida de decisiones.');
const rejected = new Map(review.decisions.filter((item) => item.status === 'reject').map((item) => [item.id, item]));
const ratings = new Map(review.decisions.filter((item) => Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5).map((item) => [item.id, item.rating]));
const knownIds = new Set(library.tracks.map((track) => track.id));
const unknown = [...rejected.keys()].filter((id) => !knownIds.has(id));
if (unknown.length) throw new Error(`Hay ${unknown.length} IDs desconocidos; no se realizó ninguna limpieza.`);

const plan = [];
for (const track of library.tracks) if (ratings.has(track.id)) track.rating = ratings.get(track.id);
for (const track of library.tracks.filter((item) => rejected.has(item.id))) {
  const audio = join(libraryRoot, track.folder, 'audio.mp3');
  const verifiedHash = await hash(audio);
  if (verifiedHash !== track.sha256) throw new Error(`Falló la verificación de ${track.title}; no se borró nada.`);
  plan.push({ id: track.id, title: track.title, folder: track.folder, sha256: verifiedHash, bytes: (await stat(audio)).size });
}

const audit = {
  preparedAt: new Date().toISOString(), decisionsFile: basename(decisionsPath), rejected: plan,
  freedBytes: plan.reduce((total, item) => total + item.bytes, 0), confidence: 1,
  evidence: ['Decisión explícita exportada desde la vitrina', 'ID cotejado contra el manifiesto', 'SHA-256 del audio verificado antes de borrar'],
  warnings: [], fallbackReason: null,
};
await writeFile(join(libraryRoot, `review-cleanup-${Date.now()}.json`), `${JSON.stringify(audit, null, 2)}\n`);
for (const item of plan) await rm(join(libraryRoot, item.folder), { recursive: true });
library.tracks = library.tracks.filter((track) => !rejected.has(track.id));
library.uniqueTracks = library.tracks.length;
library.reviewCleanup = { completedAt: new Date().toISOString(), removedTracks: plan.length, ratingsApplied: ratings.size, freedBytes: audit.freedBytes, decisionsFile: basename(decisionsPath), confidence: 1, evidence: audit.evidence, warnings: [], fallbackReason: null };
await writeFile(manifestPath, `${JSON.stringify(library, null, 2)}\n`);
console.log(JSON.stringify({ removedTracks: plan.length, remainingTracks: library.tracks.length, freedMiB: +(audit.freedBytes / 1024 ** 2).toFixed(1) }, null, 2));
