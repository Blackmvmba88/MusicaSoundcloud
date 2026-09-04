#!/usr/bin/env node
/**
 * download-soundcloud-tracks.mjs
 *
 * Descarga las pistas recuperables de SoundCloud usando yt-dlp.
 * Guarda los MP3 en la carpeta BLACKMAMBA_PLAYER de la USB,
 * actualiza library.json y regenera el catálogo del reproductor.
 *
 * Uso:
 *   node scripts/download-soundcloud-tracks.mjs [opciones]
 *
 * Opciones:
 *   --limit N         Descarga solo las primeras N pistas (útil para probar)
 *   --dry-run         Muestra qué se descargaría sin ejecutar
 *   --output DIR      Carpeta destino (default: USB player o public/player)
 *   --concurrency N   Descargas paralelas (default: 4)
 *   --cookies FILE    Ruta a un archivo cookies.txt de SoundCloud
 *   --cookies-browser BROWSER  Usar cookies del navegador (chrome, firefox, safari)
 *   --only-private    Solo reintentar pistas que fallaron con 403
 *   --sync-catalog    Solo sincronizar archivos ya descargados → catálogo (sin descargar)
 */

import { readFile, writeFile, mkdir, access, readdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY     = args.includes('--dry-run');
const SYNC    = args.includes('--sync-catalog');
const LIMIT   = (() => { const i = args.indexOf('--limit');       return i >= 0 ? Number(args[i+1]) : Infinity; })();
const CONC    = (() => { const i = args.indexOf('--concurrency'); return i >= 0 ? Number(args[i+1]) : 4; })();
const OUT_OVR = (() => { const i = args.indexOf('--output');      return i >= 0 ? args[i+1] : null; })();
const COOKIE_FILE = (() => { const i = args.indexOf('--cookies'); return i >= 0 ? args[i+1] : null; })();
const COOKIE_BROWSER = (() => { const i = args.indexOf('--cookies-browser'); return i >= 0 ? args[i+1] : null; })();

// ── Resolve output directory ────────────────────────────────────────────────
const USB_PLAYER    = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const LOCAL_FALLBACK = resolve(root, 'public/player');

async function resolveOutputDir() {
  if (OUT_OVR) return resolve(OUT_OVR);
  try { await access(USB_PLAYER); return USB_PLAYER; } catch { /* ignore */ }
  return LOCAL_FALLBACK;
}

// ── Detect yt-dlp ───────────────────────────────────────────────────────────
async function findYtDlp() {
  for (const bin of ['yt-dlp', '/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp']) {
    try { await exec(bin, ['--version']); return bin; } catch { /* ignore */ }
  }
  throw new Error('yt-dlp no encontrado. Instala con: brew install yt-dlp');
}

// ── Track ID generation ─────────────────────────────────────────────────────
const makeId = (url) =>
  createHash('sha256').update(url).digest('hex').slice(0, 16);

// ── Build yt-dlp args ───────────────────────────────────────────────────────
function buildYtDlpArgs(url, outTemplate) {
  const base = [
    url,
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--output', outTemplate,
    '--write-thumbnail',
    '--write-description',
    '--no-playlist',
    '--no-overwrites',
    '--quiet',
    '--no-warnings',
    '--socket-timeout', '30',
    '--retries', '3',
  ];
  if (COOKIE_FILE)    base.push('--cookies', COOKIE_FILE);
  if (COOKIE_BROWSER) base.push('--cookies-from-browser', COOKIE_BROWSER);
  return base;
}

// ── Download one track ──────────────────────────────────────────────────────
async function downloadTrack(rec, outDir, ytDlp, index, total) {
  const id      = makeId(rec.soundcloudUrl);
  const outFile = join(outDir, `${id}.mp3`);

  if (existsSync(outFile) && statSync(outFile).size > 10_000) {
    return { status: 'already_exists', id, file: outFile, title: rec.title };
  }

  if (DRY) {
    console.log(`[DRY ${index}/${total}] ${rec.title} → ${id}.mp3`);
    return { status: 'dry_run', id, file: outFile, title: rec.title };
  }

  try {
    const outTemplate = outFile.replace('.mp3', '.%(ext)s');
    console.log(`[${index}/${total}] ⬇  ${rec.title}`);
    await exec(ytDlp, buildYtDlpArgs(rec.soundcloudUrl, outTemplate), { timeout: 180_000 });

    if (!existsSync(outFile) || statSync(outFile).size < 10_000) {
      // Try alternative extension
      const files = (await readdir(outDir)).filter(f => f.startsWith(id));
      if (files.length) return { status: 'ok', id, file: join(outDir, files[0]), title: rec.title };
      return { status: 'error', id, file: null, title: rec.title, error: 'Output file missing or too small' };
    }

    return { status: 'ok', id, file: outFile, title: rec.title };
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || String(err)).slice(0, 250);
    const isPrivate = msg.includes('403') || msg.includes('Forbidden');
    const isMissing = msg.includes('404') || msg.includes('Not Found');
    const symbol = isPrivate ? '🔒' : isMissing ? '❌' : '⚠';
    console.error(`  ${symbol} ${isPrivate ? '[PRIVADA]' : isMissing ? '[BORRADA]' : '[ERR]'} "${rec.title}"`);
    return {
      status: 'error',
      id, file: null, title: rec.title, error: msg,
      isPrivate, isMissing,
    };
  }
}

// ── Controlled concurrency pool ─────────────────────────────────────────────
async function poolMap(items, fn, concurrency) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ── Load data ───────────────────────────────────────────────────────────────
console.log('🎵 BlackMamba SoundCloud Downloader');
console.log('════════════════════════════════════');

const [outDir, ytDlp, auditRaw, libraryRaw] = await Promise.all([
  resolveOutputDir(),
  findYtDlp(),
  readFile(resolve(root, 'soundcloud-local-audit.json'), 'utf8'),
  readFile(resolve(root, 'public/player/library.json'), 'utf8'),
]);

const audit   = JSON.parse(auditRaw);
const library = JSON.parse(libraryRaw);

// ── Build lookup maps ───────────────────────────────────────────────────────
const downloadIdToRecord = new Map(
  (audit.records || []).map(r => [makeId(r.soundcloudUrl), r])
);

// ── SYNC MODE: scan USB for already-downloaded files and update catalog ──────
if (SYNC) {
  console.log(`📂 Modo sincronización: leyendo archivos en ${outDir}…`);
  const files  = await readdir(outDir);
  const mp3s   = files.filter(f => f.endsWith('.mp3') && !f.startsWith('._'));
  let upgraded = 0;
  let added    = 0;

  const existingById   = new Map(library.tracks.map(t => [t.id, t]));
  const existingByScId = new Map(
    library.tracks.filter(t => t.soundcloudId).map(t => [`sc-${t.soundcloudId}`, t])
  );

  for (const mp3 of mp3s) {
    const id  = basename(mp3, '.mp3');
    const rec = downloadIdToRecord.get(id);
    if (!rec) continue;

    const scEntryId = `sc-${rec.soundcloudId}`;
    const existing  = existingById.get(id) ?? existingByScId.get(scEntryId);

    let cover = null;
    let lyrics = '';
    const localPlayerCovers = resolve(root, 'public/player/covers');
    await mkdir(localPlayerCovers, { recursive: true });

    for (const ext of ['.jpg', '.webp', '.png']) {
      try {
        const coverSrc = join(outDir, `${id}${ext}`);
        await access(coverSrc);
        const coverDest = join(localPlayerCovers, `${id}${ext}`);
        await copyFile(coverSrc, coverDest);
        cover = `/player/covers/${id}${ext}`;
        break;
      } catch { /* ignore */ }
    }

    try {
      const descSrc = join(outDir, `${id}.description`);
      const rawLyrics = await readFile(descSrc, 'utf8');
      if (rawLyrics.trim()) lyrics = rawLyrics.trim();
    } catch { /* ignore */ }

    if (existing) {
      existing.file               = `/player/${id}.mp3`;
      existing.localStatus        = 'available';
      existing.availabilityStatus = 'local';
      existing.localFormat        = 'mp3';
      existing.tag                = 'SoundCloud';
      if (cover) existing.cover = cover;
      if (lyrics) {
        existing.lyrics = lyrics;
        existing.hasLyrics = true;
      }
      if (existing.id !== id) {
        existingById.delete(existing.id);
        existing.id = id;
        existingById.set(id, existing);
      }
      upgraded++;
    } else {
      const newTrack = {
        id, title: rec.title, artist: 'Iyari Gomez',
        file: `/player/${id}.mp3`, downloadUrl: `/player/${id}.mp3`,
        streamUrl: null, soundcloudUrl: rec.soundcloudUrl, soundcloudId: rec.soundcloudId,
        duration: `${Math.floor(rec.durationSeconds/60)}:${String(Math.floor(rec.durationSeconds%60)).padStart(2,'0')}`,
        tag: 'SoundCloud', cover, lyrics, hasLyrics: Boolean(lyrics),
        localStatus: 'available', localFormat: 'mp3', source: 'soundcloud',
        availabilityStatus: 'local', preferredSource: null, preferredAction: 'none',
        sunoCandidates: rec.sunoCandidates ?? [], confidence: 0.9,
        evidence: [rec.soundcloudUrl], warnings: [], fallbackReason: null,
      };
      library.tracks.push(newTrack);
      existingById.set(id, newTrack);
      added++;
    }
  }

  // Remove sc- duplicate entries for tracks that now have a real hash ID
  const localHashIds = new Set(
    library.tracks.filter(t => !t.id.startsWith('sc-') && t.soundcloudId).map(t => `sc-${t.soundcloudId}`)
  );
  library.tracks = library.tracks.filter(t => !localHashIds.has(t.id));

  library.generatedAt = new Date().toISOString();
  await writeFile(resolve(root, 'public/player/library.json'), `${JSON.stringify(library, null, 2)}\n`);
  console.log(`✅ Sincronización completa:`);
  console.log(`   Pistas actualizadas (recuperable → local): ${upgraded}`);
  console.log(`   Pistas nuevas añadidas:                    ${added}`);
  console.log(`   Total en catálogo:                         ${library.tracks.length}`);
  process.exit(0);
}

// ── DOWNLOAD MODE ────────────────────────────────────────────────────────────
const recoverable = (audit.records || [])
  .filter(r => r.localStatus === 'recoverable' && r.soundcloudUrl)
  .slice(0, LIMIT);

const privates = recoverable.filter(r => {
  const id = makeId(r.soundcloudUrl);
  return !existsSync(join(outDir, `${id}.mp3`));
});

console.log(`📁 Destino:       ${outDir}`);
console.log(`🔧 yt-dlp:        ${ytDlp}`);
console.log(`📊 Recuperables:  ${recoverable.length} total, ${privates.length} pendientes`);
console.log(`⚡ Concurrencia:  ${CONC}`);
if (COOKIE_FILE)    console.log(`🍪 Cookies file:  ${COOKIE_FILE}`);
if (COOKIE_BROWSER) console.log(`🍪 Browser:       ${COOKIE_BROWSER}`);
if (DRY) console.log('🔍 MODO DRY-RUN activo');
console.log('');

if (!DRY) await mkdir(outDir, { recursive: true });

const results = await poolMap(
  recoverable.map((rec, i) => ({ rec, i: i + 1, total: recoverable.length })),
  ({ rec, i, total }) => downloadTrack(rec, outDir, ytDlp, i, total),
  CONC,
);

// ── Summary ─────────────────────────────────────────────────────────────────
const ok       = results.filter(r => r.status === 'ok');
const exists   = results.filter(r => r.status === 'already_exists');
const errors   = results.filter(r => r.status === 'error');
const privErr  = errors.filter(r => r.isPrivate);
const missing  = errors.filter(r => r.isMissing);
const other    = errors.filter(r => !r.isPrivate && !r.isMissing);

console.log('\n════ Resumen ════════════════════════════');
console.log(`✅ Descargadas:           ${ok.length}`);
console.log(`📦 Ya existían:           ${exists.length}`);
console.log(`🔒 Privadas (403):        ${privErr.length}  ← necesitan cookies`);
console.log(`❌ Borradas/404:          ${missing.length}`);
console.log(`⚠  Otros errores:         ${other.length}`);

if (privErr.length && !COOKIE_FILE && !COOKIE_BROWSER) {
  console.log('\n💡 Para descargar las pistas privadas, agrega tus cookies de SoundCloud:');
  console.log('   Opción A (recomendada — Chrome):');
  console.log('     node scripts/download-soundcloud-tracks.mjs --cookies-browser chrome');
  console.log('   Opción B (archivo cookies.txt):');
  console.log('     1. Instala extensión "Get cookies.txt LOCALLY" en Chrome');
  console.log('     2. Visita soundcloud.com estando logueado');
  console.log('     3. Exporta cookies → soundcloud-cookies.txt');
  console.log('     node scripts/download-soundcloud-tracks.mjs --cookies soundcloud-cookies.txt');
}

if (DRY) { console.log('\n✅ Dry-run completado.'); process.exit(0); }

// ── Sync catalog automatically after download ────────────────────────────────
console.log('\n📋 Sincronizando catálogo…');
const { execFile: ef } = await import('node:child_process');
const { promisify: p } = await import('node:util');
await p(ef)('node', [resolve(root, 'scripts/download-soundcloud-tracks.mjs'), '--sync-catalog']);
