import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const project = resolve(import.meta.dirname, '..');
const sourceRoot = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const destination = join(project, 'public', 'player');
const sourceManifest = JSON.parse(await readFile(join(sourceRoot, 'library.json'), 'utf8'));
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await mkdir(join(destination, 'covers'), { recursive: true });
const tracks = [];
let copiedBytes = 0;

for (const track of sourceManifest.tracks) {
  const sourceWav = join(sourceRoot, track.folder, 'audio.wav');
  const sourceMp3 = join(sourceRoot, track.folder, 'audio.mp3');
  let source = sourceWav;
  let filename = `${track.id}.wav`;
  try {
    await access(source);
  } catch {
    source = sourceMp3;
    filename = `${track.id}.mp3`;
  }
  
  const target = join(destination, filename);
  try {
    await copyFile(source, target);
    copiedBytes += (await stat(target)).size;
  } catch {
    console.warn(`No se encontró audio para ${track.title} en ${track.folder}`);
    continue;
  }
  const sourceCover = join(sourceRoot, track.folder, 'cover.jpg');
  let cover = null;
  try {
    await access(sourceCover);
    const coverName = `${track.id}.jpg`;
    await copyFile(sourceCover, join(destination, 'covers', coverName));
    cover = `/player/covers/${coverName}`;
  } catch { cover = null; }
  let lyrics = '';
  try {
    const rawLyrics = await readFile(join(sourceRoot, track.folder, track.lyrics || 'lyrics.txt'), 'utf8');
    if (rawLyrics.trim() && rawLyrics.trim() !== 'LETRA PENDIENTE') lyrics = rawLyrics.trim();
  } catch { lyrics = ''; }
  tracks.push({
    id: track.id,
    title: track.title,
    artist: track.artist || 'Por clasificar',
    file: `/player/${filename}`,
    localFormat: filename.endsWith('.wav') ? 'wav' : 'mp3',
    duration: formatTime(Number(track.durationSeconds || 0)),
    tag: track.warnings?.length ? 'Por revisar' : 'Biblioteca',
    confidence: track.confidence,
    warnings: track.warnings ?? [],
    evidence: track.evidence ?? [],
    fallbackReason: track.fallbackReason ?? null,
    ownership: track.ownership ?? null,
    cover,
    lyrics,
    hasLyrics: Boolean(lyrics),
  });
}

await writeFile(join(destination, 'library.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), source: sourceRoot, unique: tracks.length, copiedBytes, confidence: 1, evidence: ['Exportado desde la biblioteca canónica deduplicada de la USB'], warnings: [], fallbackReason: null, tracks }, null, 2)}\n`);
console.log(JSON.stringify({ tracks: tracks.length, copiedGiB: +(copiedBytes / 1024 ** 3).toFixed(2), destination }, null, 2));
