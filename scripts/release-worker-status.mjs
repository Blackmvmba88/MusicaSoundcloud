/**
 * Estado de sólo lectura para operar el vigilante desde SSH/VPN.
 * No abre un servidor, ni necesita tokens, ni inicia una migración.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const database = resolve(root, 'storage/database/music.sqlite');
const heartbeatFile = resolve(root, 'storage/sync/release-worker-health.json');
if (!existsSync(database)) {
  process.stderr.write('No existe SQLite persistente: ejecutar primero el worker.\n');
  process.exit(1);
}
const db = new DatabaseSync(database, { readOnly: true });
try {
  const runtime = db.prepare('SELECT * FROM release_worker_runtime WHERE id = 1').get();
  const states = db.prepare(`SELECT state, readiness, COUNT(*) AS count
    FROM release_jobs GROUP BY state, readiness ORDER BY state`).all();
  const blockers = db.prepare(`SELECT b.code, COUNT(*) AS count FROM release_blockers b
    GROUP BY b.code ORDER BY count DESC`).all();
  const next = db.prepare(`SELECT t.id AS trackId, t.title, t.suno_url AS sunoUrl,
    j.state, j.readiness, j.next_action AS nextAction,
    GROUP_CONCAT(b.code, ',') AS blockers
    FROM release_jobs j JOIN tracks t ON t.id = j.track_id
    LEFT JOIN release_blockers b ON b.job_id = j.id
    WHERE j.state NOT IN ('delivered', 'approved', 'uploading', 'verifying')
    GROUP BY j.id ORDER BY j.updated_at DESC, j.id DESC LIMIT 20`).all();
  let heartbeat = null;
  try { heartbeat = JSON.parse(readFileSync(heartbeatFile, 'utf8')); } catch {}
  process.stdout.write(JSON.stringify({
    checkedAt: new Date().toISOString(), runtime, heartbeat,
    total: states.reduce((sum, row) => sum + row.count, 0), states, blockers, next,
  }, null, 2) + '\n');
} finally { db.close(); }
