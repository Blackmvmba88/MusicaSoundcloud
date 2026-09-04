import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const downloads = '/Users/blackmambarecords/Downloads';
const library = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const inbox = join(library, '00_COVER_INBOX');
const manifestPath = join(library, 'library.json');
const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const libraryData = JSON.parse(await readFile(manifestPath, 'utf8'));
const deleted = [];
const preserved = [];

for (const track of libraryData.tracks) {
  const usbAudio = join(library, track.folder, 'audio.mp3');
  if (await hash(usbAudio) !== track.sha256) throw new Error(`La copia USB cambió: ${usbAudio}`);
  for (const source of track.variants) {
    if (!source.startsWith(`${downloads}/`)) continue;
    try {
      if (await hash(source) === track.sha256) { await rm(source); deleted.push(source); }
      else preserved.push({ source, reason: 'hash_changed' });
    } catch (error) {
      if (error.code !== 'ENOENT') preserved.push({ source, reason: error.message });
    }
  }
}

await mkdir(inbox, { recursive: true });
const entries = await readdir(downloads, { withFileTypes: true });
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const images = entries.filter((entry) => entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase())).map((entry) => join(downloads, entry.name)).sort();
const seen = new Map();
const imageManifest = [];
let movedBytes = 0;

for (const source of images) {
  const digest = await hash(source);
  if (seen.has(digest)) { await rm(source); seen.get(digest).variants.push(source); continue; }
  const extension = extname(source).toLowerCase() === '.jpeg' ? '.jpg' : extname(source).toLowerCase();
  const target = join(inbox, `${digest.slice(0, 16)}${extension}`);
  await copyFile(source, target);
  if (await hash(target) !== digest) throw new Error(`Falló la verificación de imagen: ${source}`);
  movedBytes += (await stat(target)).size;
  const item = { file: basename(target), sha256: digest, originalName: basename(source), variants: [source], matchedTrackId: null, confidence: 0, evidence: [], warnings: ['Portada sin cotejar'], fallbackReason: 'El nombre de la imagen no identifica una canción con suficiente certeza' };
  seen.set(digest, item); imageManifest.push(item); await rm(source);
}

await writeFile(join(inbox, 'images.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), found: images.length, unique: imageManifest.length, duplicates: images.length - imageManifest.length, movedBytes, images: imageManifest }, null, 2)}\n`);
libraryData.downloadsCleanup = { completedAt: new Date().toISOString(), deletedMp3: deleted.length, preserved, confidence: 1, evidence: ['Hash del MP3 en USB cotejado antes de borrar cada original'], warnings: [], fallbackReason: null };
libraryData.coverInbox = { path: '00_COVER_INBOX/images.json', imagesFound: images.length, uniqueImages: imageManifest.length };
await writeFile(manifestPath, `${JSON.stringify(libraryData, null, 2)}\n`);
console.log(JSON.stringify({ deletedMp3: deleted.length, preservedMp3: preserved.length, imagesMoved: images.length, uniqueImages: imageManifest.length, duplicateImages: images.length - imageManifest.length, movedMiB: +(movedBytes / 1024 ** 2).toFixed(1) }, null, 2));
