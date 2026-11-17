/**
 * BlackMamba release-worker: supervisión persistente e idempotente, sin subidas remotas.
 * Node >=24, SQLite y esquema release_jobs del orquestador.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { openDatabase, upsertSunoTrack } from '../packages/database/src/db.mjs';
import { validateTrackPackage } from '../packages/pipeline/src/validate-track-package.mjs';
import { discoverLocalMedia } from './worker-media-discovery.mjs';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORAGE = resolve(PROJECT, 'storage');
const HEALTH_FILE = resolve(STORAGE, 'sync/release-worker-health.json');
const DEFAULT_CATALOG = resolve(PROJECT, 'apps/player/suno-library-enriched.json');
const PROTECTED = new Set(['approved', 'uploading', 'verifying', 'delivered']);
const validId = /^[a-zA-Z0-9_-]{6,128}$/;

const numberEnv = (name, fallback, min, max) => {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} debe estar entre ${min} y ${max}`);
  return parsed;
};

export function planRelease({ hasAudio, validation, diagnostic = null }) {
  if (!hasAudio) return {
    state: 'awaiting_wav', readiness: 'incomplete', nextAction: 'attach_wav',
    blockers: [{ code: 'WAV_MISSING', reason: diagnostic || 'Falta WAV accesible en el volumen de medios', resolution: 'Sincronizar el WAV maestro al volumen /music' }],
  };
  if (!validation?.ready) {
    const stage = validation?.stage || 'invalid-package';
    const code = stage === 'waiting-metadata' ? 'METADATA_INCOMPLETE'
      : stage === 'waiting-cover' ? 'COVER_MISSING' : 'PACKAGE_INVALID';
    const resolution = stage === 'waiting-metadata' ? 'Completar y aprobar la ficha .wav.suno.json'
      : stage === 'waiting-cover' ? 'Agregar y aprobar portada real 1:1'
      : 'Corregir el archivo o sus referencias y ejecutar nueva revisión';
    return {
      state: 'preparing', readiness: 'incomplete', nextAction: 'complete_assets',
      blockers: [{ code, reason: (validation?.errors || [diagnostic || stage]).join('; '), resolution }],
    };
  }
  return { state: 'ready_for_review', readiness: 'complete', nextAction: 'review_package', blockers: [] };
}

function setHealth(info) {
  mkdirSync(dirname(HEALTH_FILE), { recursive: true });
  const temporary = `${HEALTH_FILE}.tmp`;
  writeFileSync(temporary, JSON.stringify({ ...info, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
  renameSync(temporary, HEALTH_FILE);
}

function healthcheck() {
  try {
    const heartbeat = JSON.parse(readFileSync(HEALTH_FILE, 'utf8'));
    const interval = numberEnv('WORKER_INTERVAL_SECONDS', 300, 10, 86400);
    const age = Date.now() - Date.parse(heartbeat.at);
    if (heartbeat.status === 'error') throw new Error('último ciclo falló');
    if (!Number.isFinite(age) || age < 0 || age > interval * 3000 + 60000) throw new Error('heartbeat vencido');
    process.stdout.write(JSON.stringify({ ok: true, at: heartbeat.at }) + '\n');
  } catch (error) {
    process.stderr.write(`worker unhealthy: ${error.message}\n`);
    process.exitCode = 1;
  }
}

function initWorker(db) {
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS release_worker_runtime (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_track_id INTEGER NOT NULL DEFAULT 0,
    catalog_sha256 TEXT,
    last_success_at TEXT,
    last_error TEXT
  )`);
  db.exec('INSERT OR IGNORE INTO release_worker_runtime(id) VALUES (1)');
  const present = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='release_jobs'").get();
  if (!present) throw new Error('La rama requiere la migración release_jobs de PR #9');
}

function readConfig() {
  const media = resolve(process.env.WORKER_MEDIA_ROOT || '/music');
  const sourcePrefix = process.env.WORKER_SOURCE_AUDIO_PREFIX || '/Volumes/ADATA SC740/MÚSICA/WAV_MASTER';
  return {
    interval: numberEnv('WORKER_INTERVAL_SECONDS', 300, 10, 86400),
    batch: numberEnv('WORKER_BATCH_SIZE', 100, 1, 2000),
    media,
    sourcePrefix,
    catalog: resolve(process.env.WORKER_SUNO_CATALOG || DEFAULT_CATALOG),
  };
}

// Las rutas importadas de la Mac se resuelven dentro del volumen de solo lectura.
// Se niega acceso fuera de /music y mediante enlaces simbólicos.
export function mapMediaPath(value, config) {
  if (!value || typeof value !== 'string') return null;
  let mapped = value;
  if (value === config.sourcePrefix || value.startsWith(config.sourcePrefix + sep)) {
    mapped = join(config.media, relative(config.sourcePrefix, value));
  }
  const absolute = resolve(mapped);
  if (absolute === config.media || !absolute.startsWith(config.media + sep)) return null;
  return absolute;
}

async function safeFile(path, config) {
  if (!path) return false;
  try {
    const [root, target, meta] = await Promise.all([realpath(config.media), realpath(path), stat(path)]);
    return meta.isFile() && target.startsWith(root + sep);
  } catch { return false; }
}

async function validateTrack(track, config) {
  if (!track.local_path) return planRelease({ hasAudio: false });
  const audioPath = mapMediaPath(track.local_path, config);
  if (!await safeFile(audioPath, config)) return planRelease({
    hasAudio: false, diagnostic: 'La ruta local no está montada o el WAV no es accesible en /music',
  });
  let sidecar;
  try {
    sidecar = JSON.parse(await readFile(audioPath + '.suno.json', 'utf8'));
  } catch (error) {
    return planRelease({
      hasAudio: true,
      validation: { ready: false, stage: 'waiting-metadata', errors: [`Ficha .wav.suno.json ausente o inválida: ${error.code || error.message}`] },
    });
  }
  let cover = null;
  if (sidecar.coverPath) {
    const candidate = isAbsolute(sidecar.coverPath)
      ? mapMediaPath(sidecar.coverPath, config)
      : mapMediaPath(resolve(dirname(audioPath), sidecar.coverPath), config);
    if (await safeFile(candidate, config)) cover = candidate;
  }
  const validation = await validateTrackPackage({
    audioPath, artworkPath: cover, sidecar, title: sidecar.title || track.title,
  });
  return planRelease({ hasAudio: true, validation });
}

function sameBlockers(previous, next) {
  const compact = (items) => JSON.stringify(items.map(({ code, reason, resolution }) => [code, reason, resolution]).sort((a, b) => a[0].localeCompare(b[0])));
  return compact(previous) === compact(next);
}

export function persistReleasePlan(db, track, plan) {
  db.exec('SAVEPOINT release_worker_track');
  try {
    let job = db.prepare('SELECT * FROM release_jobs WHERE track_id = ? ORDER BY id LIMIT 1').get(track.id);
    if (!job) {
      const key = track.suno_id ? `suno:${track.suno_id}` : `track:${track.id}`;
      db.prepare("INSERT OR IGNORE INTO release_jobs(track_id, job_key, state, readiness) VALUES (?, ?, 'detected', 'incomplete')")
        .run(track.id, key);
      job = db.prepare('SELECT * FROM release_jobs WHERE track_id = ? ORDER BY id LIMIT 1').get(track.id);
      if (!job) throw new Error(`job_key en conflicto: ${key}`);
    }
    if (PROTECTED.has(job.state)) {
      db.exec('RELEASE SAVEPOINT release_worker_track');
      return { protected: true, changed: false };
    }
    const previous = db.prepare('SELECT code, reason, resolution FROM release_blockers WHERE job_id = ?').all(job.id);
    const changed = job.state !== plan.state || job.readiness !== plan.readiness ||
      job.next_action !== plan.nextAction || !sameBlockers(previous, plan.blockers);
    if (changed) {
      const version = job.transition_version + (job.state !== plan.state ? 1 : 0);
      db.prepare(`UPDATE release_jobs
        SET state = ?, readiness = ?, next_action = ?, last_reason = ?, transition_version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(plan.state, plan.readiness, plan.nextAction, plan.blockers[0]?.reason || null, version, job.id);
      if (job.state !== plan.state) {
        db.prepare(`INSERT INTO release_transitions
          (job_id, transition_version, from_state, to_state, reason, evidence_json)
          VALUES (?, ?, ?, ?, 'worker_validation', '{}')`).run(job.id, version, job.state, plan.state);
      }
      if (!sameBlockers(previous, plan.blockers)) {
        db.prepare('DELETE FROM release_blockers WHERE job_id = ?').run(job.id);
        const insert = db.prepare('INSERT INTO release_blockers(job_id, code, reason, resolution) VALUES (?, ?, ?, ?)');
        for (const blocker of plan.blockers) insert.run(job.id, blocker.code, blocker.reason, blocker.resolution);
      }
    }
    db.exec('RELEASE SAVEPOINT release_worker_track');
    return { protected: false, changed };
  } catch (error) {
    db.exec('ROLLBACK TO SAVEPOINT release_worker_track');
    db.exec('RELEASE SAVEPOINT release_worker_track');
    throw error;
  }
}

async function importCatalog(db, catalog) {
  if (!existsSync(catalog)) return { imported: 0, skipped: 'catalog-not-mounted' };
  const contents = readFileSync(catalog);
  const sha = createHash('sha256').update(contents).digest('hex');
  const checkpoint = db.prepare('SELECT catalog_sha256 FROM release_worker_runtime WHERE id = 1').get();
  if (checkpoint.catalog_sha256 === sha) return { imported: 0, skipped: 'unchanged' };
  const data = JSON.parse(contents.toString('utf8'));
  const records = Array.isArray(data) ? data : data.tracks;
  if (!Array.isArray(records)) throw new Error('Catálogo inválido: se esperaba tracks[]');
  let count = 0;
  db.exec('SAVEPOINT release_worker_catalog');
  try {
    const exists = db.prepare('SELECT 1 FROM tracks WHERE suno_id = ?');
    for (const track of records) {
      if (!track || !validId.test(String(track.id || '')) || exists.get(String(track.id))) continue;
      upsertSunoTrack(db, {
        id: track.id, title: track.title, artist: 'Iyari Gomez',
        observedAt: track.createdAt || data.capturedAt,
        source: 'worker-catalog', page: track.page,
      });
      count++;
    }
    db.prepare('UPDATE release_worker_runtime SET catalog_sha256 = ? WHERE id = 1').run(sha);
    db.exec('RELEASE SAVEPOINT release_worker_catalog');
  } catch (error) {
    db.exec('ROLLBACK TO SAVEPOINT release_worker_catalog');
    db.exec('RELEASE SAVEPOINT release_worker_catalog');
    throw error;
  }
  return { imported: count };
}

export async function scanOnce(db, config) {
  initWorker(db);
  const catalog = await importCatalog(db, config.catalog);
  const mediaScan = await discoverLocalMedia(db, config);
  let cursor = db.prepare('SELECT last_track_id FROM release_worker_runtime WHERE id = 1').get().last_track_id;
  const query = db.prepare(`SELECT * FROM tracks
    WHERE id > ? AND soundcloud_id IS NULL AND (suno_id IS NOT NULL OR local_path IS NOT NULL)
    ORDER BY id LIMIT ?`);
  let tracks = query.all(cursor, config.batch);
  if (!tracks.length && cursor !== 0) { cursor = 0; tracks = query.all(cursor, config.batch); }
  const totals = { examined: tracks.length, changed: 0, protected: 0, errors: 0, cursor, catalog, mediaScan };
  for (const track of tracks) {
    try {
      const plan = await validateTrack(track, config);
      const result = persistReleasePlan(db, track, plan);
      if (result.changed) totals.changed++;
      if (result.protected) totals.protected++;
    } catch (error) {
      totals.errors++;
      process.stderr.write(JSON.stringify({ event: 'track-error', trackId: track.id, message: error.message }) + '\n');
    }
  }
  const nextCursor = tracks.length ? tracks[tracks.length - 1].id : 0;
  db.prepare(`UPDATE release_worker_runtime SET
    last_track_id = ?, last_success_at = CURRENT_TIMESTAMP, last_error = ?
    WHERE id = 1`).run(nextCursor, totals.errors ? `${totals.errors} track(s) fallaron` : null);
  totals.cursor = nextCursor;
  setHealth({ status: totals.errors ? 'partial' : 'ok', ...totals });
  return totals;
}

async function main() {
  const config = readConfig();
  const db = openDatabase();
  let stopped = false;
  const abort = new AbortController();
  const stop = () => { stopped = true; abort.abort(); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    do {
      try {
        const report = await scanOnce(db, config);
        process.stdout.write(JSON.stringify({ event: 'release-scan', ...report }) + '\n');
      } catch (error) {
        setHealth({ status: 'error', message: error.message });
        process.stderr.write(JSON.stringify({ event: 'cycle-error', message: error.message }) + '\n');
        if (process.argv.includes('--once')) throw error;
      }
      if (process.argv.includes('--once') || stopped) break;
      try { await sleep(config.interval * 1000, undefined, { signal: abort.signal }); }
      catch (error) { if (error.name !== 'AbortError') throw error; }
    } while (!stopped);
  } finally { db.close(); }
}

if (process.argv.includes('--health')) healthcheck();
else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
