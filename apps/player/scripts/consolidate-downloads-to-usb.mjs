import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = '/Users/blackmambarecords/Downloads';
const libraryRoot = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const cleanTitle = (file) => basename(file, extname(file)).normalize('NFC').replace(/\s+/g, ' ').trim();
const slugify = (title) => title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).toLowerCase() || 'sin-titulo';
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const probe = (file) => {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate:format_tags=title,artist,album,genre,date', '-of', 'json', file], { encoding: 'utf8' });
  try { return JSON.parse(result.stdout).format ?? {}; } catch { return {}; }
};

const entries = await readdir(sourceRoot, { withFileTypes: true });
const sources = entries.filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.mp3').map((entry) => join(sourceRoot, entry.name)).sort();
const seen = new Map();
const manifest = [];
let copiedBytes = 0;
await mkdir(libraryRoot, { recursive: true });

for (const source of sources) {
  const hash = await sha256(source);
  if (seen.has(hash)) { seen.get(hash).variants.push(source); continue; }
  const title = cleanTitle(source);
  const folderName = `${slugify(title)}--${hash.slice(0, 8)}`;
  const folder = join(libraryRoot, folderName);
  const audio = join(folder, 'audio.mp3');
  const media = probe(source);
  await mkdir(folder, { recursive: true });
  await copyFile(source, audio);
  if (await sha256(audio) !== hash) throw new Error(`Falló la verificación: ${source}`);
  copiedBytes += (await stat(audio)).size;
  const track = {
    id: hash.slice(0, 16), title: media.tags?.title || title, artist: media.tags?.artist || 'Por clasificar',
    album: media.tags?.album || '', genre: media.tags?.genre || '', year: media.tags?.date || '',
    durationSeconds: Number(media.duration || 0), bitRate: Number(media.bit_rate || 0),
    audio: 'audio.mp3', cover: 'cover.jpg', lyrics: 'lyrics.txt', sha256: hash, source, variants: [source],
    confidence: media.tags?.title || media.tags?.artist ? 0.7 : 0.35,
    evidence: ['Nombre original del archivo', 'Metadatos embebidos del MP3 cuando existen', 'SHA-256 verificado después de copiar'],
    warnings: media.tags?.artist ? ['Portada y letra pendientes'] : ['Artista pendiente de clasificación', 'Portada y letra pendientes'],
    fallbackReason: media.tags?.title ? null : 'Se usó el nombre del archivo porque el MP3 no contiene título embebido',
  };
  await writeFile(join(folder, 'lyrics.txt'), 'LETRA PENDIENTE\n');
  seen.set(hash, track);
  manifest.push({ ...track, folder: folderName });
}

for (const track of manifest) {
  track.variants = seen.get(track.sha256).variants;
  await writeFile(join(libraryRoot, track.folder, 'metadata.json'), `${JSON.stringify(track, null, 2)}\n`);
}

const summary = {
  generatedAt: new Date().toISOString(), sourceRoot, libraryRoot, mp3Found: sources.length,
  uniqueTracks: manifest.length, duplicateFiles: sources.length - manifest.length, copiedBytes,
  confidence: 1, evidence: ['Todos los MP3 de Downloads fueron calculados por SHA-256', 'Cada copia fue recalculada y cotejada en la USB'],
  warnings: ['Los originales permanecen en Downloads hasta una limpieza explícita'], fallbackReason: null, tracks: manifest,
};
await writeFile(join(libraryRoot, 'library.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ libraryRoot, mp3Found: sources.length, uniqueTracks: manifest.length, duplicateFiles: sources.length - manifest.length, copiedGiB: +(copiedBytes / 1024 ** 3).toFixed(2) }, null, 2));
