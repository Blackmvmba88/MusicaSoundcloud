import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const libraryRoot = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(libraryRoot, 'library.json');
const sourceRoots = [
  '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BlackMamba_Music_Arsenal/MP3_Distribution',
  '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BlackMamba_Music_Arsenal/MP3',
  '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BlackMamba_Music_Vault/MP3_Distribution',
];
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const cleanTitle = (file) => basename(file, extname(file)).normalize('NFC').replace(/\s+-\s+BlackMamba$/i, '').replace(/\s+/g, ' ').trim();
const slugify = (title) => title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).toLowerCase() || 'sin-titulo';
const probe = (file) => {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate:format_tags=title,artist,album,genre,date', '-of', 'json', file], { encoding: 'utf8' });
  try { return JSON.parse(result.stdout).format ?? {}; } catch { return {}; }
};
async function walk(directory, files = []) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.mp3' && !entry.name.startsWith('._')) files.push(path);
  }
  return files;
}

const library = JSON.parse(await readFile(manifestPath, 'utf8'));
const byHash = new Map(library.tracks.map((track) => [track.sha256, track]));
const sources = [...new Set((await Promise.all(sourceRoots.map((root) => walk(root)))).flat())].sort();
let imported = 0;
let duplicateFiles = 0;
let copiedBytes = 0;

for (const source of sources) {
  const hash = await sha256(source);
  const existing = byHash.get(hash);
  if (existing) {
    existing.variants ??= [];
    if (!existing.variants.includes(source)) existing.variants.push(source);
    duplicateFiles += 1;
    continue;
  }
  const title = cleanTitle(source);
  const folderName = `${slugify(title)}--${hash.slice(0, 8)}`;
  const folder = join(libraryRoot, folderName);
  const target = join(folder, 'audio.mp3');
  const media = probe(source);
  await mkdir(folder, { recursive: true });
  await copyFile(source, target);
  if (await sha256(target) !== hash) throw new Error(`Falló la copia verificada: ${source}`);
  copiedBytes += (await stat(target)).size;
  const track = {
    id: hash.slice(0, 16), title: media.tags?.title || title, artist: media.tags?.artist || 'BlackMamba',
    album: media.tags?.album || '', genre: media.tags?.genre || '', year: media.tags?.date || '',
    durationSeconds: Number(media.duration || 0), bitRate: Number(media.bit_rate || 0),
    audio: 'audio.mp3', cover: 'cover.jpg', lyrics: 'lyrics.txt', sha256: hash, source, variants: [source], folder: folderName,
    confidence: 0.85,
    evidence: ['Origen dentro de BlackMamba Music Arsenal o Vault', 'Formato MP3 de distribución', 'SHA-256 verificado después de copiar'],
    warnings: ['Portada y letra pendientes de cotejo'], fallbackReason: null,
  };
  await writeFile(join(folder, 'lyrics.txt'), 'LETRA PENDIENTE\n');
  await writeFile(join(folder, 'metadata.json'), `${JSON.stringify(track, null, 2)}\n`);
  library.tracks.push(track); byHash.set(hash, track); imported += 1;
}

library.uniqueTracks = library.tracks.length;
library.usbCollectionImport = {
  completedAt: new Date().toISOString(), sourceRoots, filesScanned: sources.length, imported,
  duplicateFiles, copiedBytes, confidence: 0.95,
  evidence: ['Sólo se usaron carpetas BlackMamba MP3 y MP3 Distribution', 'Deduplicación por SHA-256 contra toda la biblioteca'],
  warnings: ['Las ubicaciones históricas se conservaron'], fallbackReason: null,
};
await writeFile(manifestPath, `${JSON.stringify(library, null, 2)}\n`);
console.log(JSON.stringify({ filesScanned: sources.length, imported, duplicateFiles, totalLibraryTracks: library.tracks.length, copiedGiB: +(copiedBytes / 1024 ** 3).toFixed(2) }, null, 2));
