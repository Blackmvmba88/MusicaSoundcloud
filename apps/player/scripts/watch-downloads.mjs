#!/usr/bin/env node
/**
 * watch-downloads.mjs
 *
 * Vigila la carpeta de descargas de macOS en segundo plano.
 * Cuando detecta un nuevo archivo MP3 descargado:
 *   1. Busca la mejor coincidencia en el catálogo soundcloud-local-audit.json
 *      usando similitud de títulos (comparación difusa y palabra por palabra).
 *   2. Copia el archivo renombrándolo al hash ID correcto a:
 *      - El directorio local del reproductor (public/player/)
 *      - El directorio de la USB (ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER/)
 *   3. Lanza automáticamente el script de sincronización para actualizar la base de datos.
 *
 * Ejecución:
 *   node scripts/watch-downloads.mjs
 */

import { readFile, copyFile } from 'node:fs/promises';
import { resolve, dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import chokidar from 'chokidar';

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

const WATCH_DIR = '/Users/blackmambarecords/Downloads';
const USB_PLAYER = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const LOCAL_PLAYER = resolve(root, 'public/player');

// Helper para normalizar textos para comparación difusa
const norm = (v = '') =>
  v.normalize('NFD')
   .replace(/[\u0300-\u036f]/g, '')
   .toLowerCase()
   .replace(/[^a-z0-9]+/g, ' ')
   .trim();

const makeId = (url) =>
  createHash('sha256').update(url).digest('hex').slice(0, 16);

// Cargar catálogo de SoundCloud
async function loadAuditRecords() {
  try {
    const raw = await readFile(resolve(root, 'soundcloud-local-audit.json'), 'utf8');
    return JSON.parse(raw).records || [];
  } catch {
    console.error('✗ No se pudo leer soundcloud-local-audit.json');
    return [];
  }
}

// Encuentra la mejor pista coincidente en base al nombre del archivo
function findBestMatch(filename, records) {
  const cleanName = basename(filename, extname(filename));
  const cleanNorm = norm(cleanName);
  const fileWords = cleanNorm.split(' ').filter(w => w.length > 2);

  let bestMatch = null;
  let highestScore = 0;

  for (const rec of records) {
    const titleNorm = norm(rec.title);
    
    // Coincidencia exacta de título normalizado
    if (titleNorm === cleanNorm) {
      return { record: rec, score: 100 };
    }

    // Coincidencia de palabras clave
    const matchWords = fileWords.filter(word => titleNorm.includes(word));
    const score = matchWords.length;

    if (score > highestScore && score >= 1) {
      highestScore = score;
      bestMatch = rec;
    }
  }

  return bestMatch ? { record: bestMatch, score: highestScore } : null;
}

// Procesar el nuevo archivo detectado
async function handleNewFile(filePath) {
  const filename = basename(filePath);
  
  // Ignorar archivos temporales de descarga (.crdownload, .tmp, etc.)
  if (filename.startsWith('.') || extname(filePath).toLowerCase() !== '.mp3') return;

  // Esperar a que el archivo termine de escribirse (tamaño estable)
  let prevSize = -1;
  while (true) {
    try {
      const size = statSync(filePath).size;
      if (size === prevSize && size > 1000) break;
      prevSize = size;
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n📥 Nuevo archivo MP3 detectado en descargas: "${filename}"`);
  
  const records = await loadAuditRecords();
  const matchResult = findBestMatch(filename, records);

  if (!matchResult) {
    console.log(`❓ No se encontró coincidencia directa para "${filename}" en el inventario de SoundCloud.`);
    return;
  }

  const { record, score } = matchResult;
  const hashId = makeId(record.soundcloudUrl);
  
  console.log(`🎯 Coincidencia encontrada con score (${score}): "${record.title}"`);
  console.log(`   🔗 SoundCloud: ${record.soundcloudUrl}`);
  console.log(`   🔑 Target ID:  ${hashId}`);

  // Rutas de copia
  const destLocal = join(LOCAL_PLAYER, `${hashId}.mp3`);
  const destUsb = join(USB_PLAYER, `${hashId}.mp3`);

  // Copiar archivo a local y USB
  try {
    await copyFile(filePath, destLocal);
    console.log(`   ✓ Copiado local: ${destLocal}`);
    
    if (existsSync(USB_PLAYER)) {
      await copyFile(filePath, destUsb);
      console.log(`   ✓ Copiado a USB: ${destUsb}`);
    } else {
      console.log(`   ⚠ USB no montada, se omitió copia a la USB.`);
    }

    // Ejecutar el script de sincronización del catálogo
    console.log('   🔄 Actualizando catálogo de reproducción...');
    await exec('node', [resolve(root, 'scripts/download-soundcloud-tracks.mjs'), '--sync-catalog']);
    console.log('   ✓ Catálogo sincronizado.');

  } catch (err) {
    console.error('   ✗ Falló la copia/sincronización del archivo:', err.message);
  }
}

// Iniciar vigilancia
console.log('👀 Iniciando servicio de vigilancia en descargas (BLACKMAMBA DOWNLOADS WATCHER)');
console.log(`   Carpetas vigiladas: ${WATCH_DIR}`);
console.log(`   Destino USB:        ${USB_PLAYER}`);
console.log('   Escuchando descargas de archivos .mp3…');

const watcher = chokidar.watch(WATCH_DIR, {
  persistent: true,
  ignoreInitial: true,
  depth: 0,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100
  }
});

watcher.on('add', filePath => {
  handleNewFile(filePath).catch(console.error);
});
