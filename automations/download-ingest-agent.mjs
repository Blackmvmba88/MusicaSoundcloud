/** BlackMamba RECORDS: Downloads -> shared worker media. No network uploads. Node >=22. */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, watch } from 'node:fs';
import { copyFile, link, lstat, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = new Set(['.wav', '.mp3', '.m4a', '.flac']);
const DEFAULT_STATE = join(PROJECT, 'storage/sync/download-ingest-state.json');
export const isCandidate = name => !name.startsWith('.') && !name.startsWith('._') &&
  AUDIO.has(extname(name).toLowerCase()) &&
  !/\.(?:part|download|crdownload|partial|tmp)$/i.test(name);

function validate(config) {
  const downloads = resolve(config.downloads), media = resolve(config.media);
  if (downloads === media || downloads.startsWith(media + sep) || media.startsWith(downloads + sep))
    throw new Error('Descargas y medios no pueden estar anidados');
  if (!Number.isInteger(config.minAgeMs) || config.minAgeMs < 0) throw new Error('minAgeMs inválido');
  return { downloads, media, statePath: resolve(config.statePath), minAgeMs: config.minAgeMs };
}
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function readJournal(path) {
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (data?.version !== 1 || typeof data.files !== 'object' || !data.files ||
        typeof data.byHash !== 'object' || !data.byHash ||
        Array.isArray(data.files) || Array.isArray(data.byHash)) throw new Error('invalid schema');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, files: {}, byHash: {} };
    throw new Error('Checkpoint ilegible: fallo cerrado para proteger deduplicación', { cause: error });
  }
}
async function writeJournal(path, journal) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + '.' + randomUUID() + '.tmp';
  try {
    const file = await open(tmp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(journal, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
    await rename(tmp, path);
  } finally { await rm(tmp, { force: true }); }
}
async function sameContent(path, hash) {
  try { return (await lstat(path)).isFile() && await digest(path) === hash; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function stillVerified(record, now) {
  try {
    const info = await lstat(record.destination);
    if (!info.isFile()) return false;
    if (info.size === record.destinationSize && info.mtimeMs === record.destinationMtimeMs &&
        Number.isFinite(record.verifiedAt) && now - record.verifiedAt < 86400000) return true;
    if (!await sameContent(record.destination, record.sha256)) return false;
    record.destinationSize = info.size;
    record.destinationMtimeMs = info.mtimeMs;
    record.verifiedAt = now;
    return true;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function filename(name, hash) {
  const ext = extname(name).toLowerCase();
  const stem = basename(name, extname(name)).normalize('NFC')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 90).trim() || 'audio';
  return stem + '--' + hash.slice(0, 16) + ext;
}
async function stage(source, destination, hash) {
  await mkdir(dirname(destination), { recursive: true });
  if (await sameContent(destination, hash)) return;
  try { await lstat(destination); throw new Error('Destino ocupado por contenido distinto'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const tmp = destination + '.' + randomUUID() + '.tmp';
  try {
    await copyFile(source, tmp);
    if (await digest(tmp) !== hash) throw new Error('La descarga cambió durante la copia');
    // Hard link creates the final filename without overwriting existing content.
    try { await link(tmp, destination); }
    catch (error) {
      if (error.code !== 'EEXIST' || !await sameContent(destination, hash)) throw error;
    }
  } finally { await rm(tmp, { force: true }); }
}
async function sidecar(source, destination, now, age) {
  if (!destination.toLowerCase().endsWith('.wav')) return false;
  const from = source + '.suno.json', to = destination + '.suno.json';
  let bytes;
  try {
    const info = await lstat(from);
    if (!info.isFile() || now - info.mtimeMs < age) return false;
    bytes = await readFile(from);
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  try {
    const json = JSON.parse(bytes.toString('utf8'));
    if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  } catch { return false; }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (await sameContent(to, hash)) return false;
  try {
    await lstat(to);
    // A matching WAV hash does NOT prove two releases have the same Suno identity.
    // Never overwrite or silently discard the second metadata identity.
    const existing = JSON.parse(await readFile(to, 'utf8'));
    const incoming = JSON.parse(bytes.toString('utf8'));
    const currentId = String(existing?.id || existing?.sunoId || '').trim();
    const incomingId = String(incoming?.id || incoming?.sunoId || '').trim();
    const error = new Error(
      currentId && incomingId && currentId !== incomingId
        ? 'Conflicto de identidad Suno: WAV idéntico con IDs distintos; revisión manual'
        : 'Conflicto de metadatos: ficha diferente a la registrada; revisión manual'
    );
    error.code = 'SIDECAR_CONFLICT';
    throw error;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await stage(from, to, hash);
  return true;
}

/** A complete pass reconciles events lost while asleep, rebooting or watching. */
export async function scanDownloadsOnce(rawConfig, now = Date.now()) {
  const config = validate(rawConfig), journal = await readJournal(config.statePath);
  const entries = await readdir(config.downloads, { withFileTypes: true });
  const totals = { examined: 0, waiting: 0, staged: 0, duplicates: 0, sidecars: 0, conflicts: 0, failures: 0 };
  for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !isCandidate(entry.name)) continue;
    totals.examined++;
    const source = join(config.downloads, entry.name);
    try {
      const info = await lstat(source);
      if (!info.isFile() || info.size === 0) { totals.waiting++; continue; }
      const old = journal.files[source];
      if (!old || old.size !== info.size || old.mtimeMs !== info.mtimeMs) {
        journal.files[source] = { size: info.size, mtimeMs: info.mtimeMs, observedAt: now };
        totals.waiting++; continue;
      }
      if (now - old.observedAt < config.minAgeMs || now - info.mtimeMs < config.minAgeMs) {
        totals.waiting++; continue;
      }
      if (old.status === 'staged' && old.destination && await stillVerified(old, now)) {
        if (await sidecar(source, old.destination, now, config.minAgeMs)) totals.sidecars++;
        continue;
      }
      const hash = await digest(source);
      const verified = await lstat(source);
      if (!verified.isFile() || verified.size !== info.size || verified.mtimeMs !== info.mtimeMs) {
        journal.files[source] = { size: verified.size, mtimeMs: verified.mtimeMs, observedAt: now };
        totals.waiting++; continue;
      }
      const ext = extname(entry.name).toLowerCase();
      const folder = ext === '.wav' ? config.media : join(config.media, 'pending-import');
      const found = journal.byHash[hash];
      const destination = found?.destination || join(folder, filename(entry.name, hash));
      if (!found || !await sameContent(destination, hash)) {
        await stage(source, destination, hash);
        totals.staged++;
      } else totals.duplicates++;
      const placed = await lstat(destination);
      journal.byHash[hash] = { destination, status: ext === '.wav' ? 'awaiting-validation' : 'awaiting-wav-conversion' };
      journal.files[source] = { size: info.size, mtimeMs: info.mtimeMs, observedAt: old.observedAt,
        sha256: hash, status: 'staged', destination, destinationSize: placed.size,
        destinationMtimeMs: placed.mtimeMs, verifiedAt: now };
      if (await sidecar(source, destination, now, config.minAgeMs)) totals.sidecars++;
      await writeJournal(config.statePath, journal);
    } catch (error) {
      if (error.code === 'SIDECAR_CONFLICT') {
        totals.conflicts++;
        journal.files[source] = {
          ...(journal.files[source] || {}),
          status: 'metadata-conflict',
          conflictReason: error.message,
          conflictAt: new Date(now).toISOString(),
        };
        await writeJournal(config.statePath, journal);
      } else totals.failures++;
      process.stderr.write(JSON.stringify({
        event: error.code === 'SIDECAR_CONFLICT' ? 'download-metadata-conflict' : 'download-ingest-error',
        file: entry.name, error: error.message,
      }) + '\n');
    }
  }
  await writeJournal(config.statePath, journal);
  return totals;
}

function integerEnv(key, fallback, min, max) {
  const n = Number(process.env[key] || fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(key + ' fuera de rango');
  return n;
}
async function main() {
  const config = {
    downloads: process.env.BLACKMAMBA_DOWNLOADS_DIR || join(homedir(), 'Downloads'),
    media: process.env.WORKER_MEDIA_DIR || join(PROJECT, 'media'),
    statePath: process.env.BLACKMAMBA_INGEST_STATE || DEFAULT_STATE,
    minAgeMs: integerEnv('BLACKMAMBA_STABLE_MS', 3000, 0, 600000),
  };
  const interval = integerEnv('BLACKMAMBA_RESCAN_SECONDS', 30, 1, 3600) * 1000;
  let running = false, dirty = false, stopping = false, retryAt = 0;
  const run = async () => {
    if (running || stopping) { dirty = true; return; }
    running = true;
    try {
      do {
        dirty = false;
        const report = await scanDownloadsOnce(config);
        if (report.waiting) retryAt = Date.now() + Math.max(config.minAgeMs, 1000);
        process.stdout.write(JSON.stringify({ event: 'download-scan', at: new Date().toISOString(), ...report }) + '\n');
      } while (dirty && !stopping);
    } catch (error) {
      process.stderr.write(JSON.stringify({ event: 'download-scan-failed', error: error.message }) + '\n');
      if (process.argv.includes('--once')) process.exitCode = 1;
    } finally { running = false; }
  };
  await run();
  if (process.argv.includes('--once')) return;
  const observer = watch(config.downloads, { persistent: true }, () => { dirty = true; });
  const timer = setInterval(() => { void run(); }, interval);
  const eventTimer = setInterval(() => {
    const retryDue = retryAt > 0 && Date.now() >= retryAt;
    if (retryDue) retryAt = 0;
    if ((dirty || retryDue) && !running) void run();
  }, 1000);
  eventTimer.unref();
  const stop = () => { stopping = true; observer.close(); clearInterval(timer); clearInterval(eventTimer); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  observer.on('error', error => process.stderr.write(JSON.stringify({ event: 'watch-error', error: error.message }) + '\n'));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
