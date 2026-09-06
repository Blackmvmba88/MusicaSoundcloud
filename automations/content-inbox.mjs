import { existsSync, watch as watchFs } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { openDatabase, upsertContentEvent } from '../packages/database/src/db.mjs';
import { classifyContentPath, fileExternalId, isPartialDownload } from '../packages/content/src/classify.mjs';

if (existsSync('.env')) loadEnvFile('.env');

const argv = new Set(process.argv.slice(2));
const watchMode = argv.has('--watch');
const includeExisting = argv.has('--include-existing');
const settleMs = Math.max(300, Math.min(Number(process.env.CONTENT_SETTLE_MS || 1200), 10_000));
const rootSpec = process.env.CONTENT_INBOX_PATHS || resolve(homedir(), 'Downloads');
const roots = rootSpec.split(';').map((value) => resolve(value.trim())).filter(Boolean);
const db = openDatabase();
const lastSeen = new Map();
const timers = new Map();

function remember(key, signature) {
  lastSeen.set(key, signature);
  if (lastSeen.size > 5000) {
    const oldest = lastSeen.keys().next().value;
    lastSeen.delete(oldest);
  }
}

async function stableInfo(path) {
  if (!existsSync(path) || isPartialDownload(path)) return null;
  const first = await stat(path).catch(() => null);
  if (!first?.isFile()) return null;
  await new Promise((done) => setTimeout(done, settleMs));
  const second = await stat(path).catch(() => null);
  if (!second?.isFile()) return null;
  if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) return null;
  return second;
}

async function record(path, root) {
  const info = await stableInfo(path);
  if (!info) return false;
  const externalId = fileExternalId(info, path);
  const signature = `${info.size}:${Math.trunc(info.mtimeMs)}`;
  if (lastSeen.get(externalId) === signature) return false;

  const item = upsertContentEvent(db, {
    source: 'filesystem',
    externalId,
    kind: classifyContentPath(path),
    title: basename(path, extname(path)),
    localPath: path,
    bytes: info.size,
    observedAt: new Date(info.birthtimeMs || info.ctimeMs || Date.now()).toISOString(),
    metadata: {
      root,
      extension: extname(path).toLowerCase(),
      mtimeMs: info.mtimeMs,
      dev: info.dev,
      ino: info.ino,
    },
  });
  remember(externalId, signature);
  console.log(JSON.stringify({ event: 'content.local', id: item.id, kind: item.kind, path: item.local_path }));
  return true;
}

function schedule(path, root, delay = 120) {
  if (!path || basename(path).startsWith('.')) return;
  clearTimeout(timers.get(path));
  timers.set(path, setTimeout(async () => {
    timers.delete(path);
    try {
      const recorded = await record(path, root);
      if (!recorded && existsSync(path) && !isPartialDownload(path)) schedule(path, root, settleMs);
    } catch (error) {
      console.error(JSON.stringify({ event: 'content.error', path, error: error.message }));
    }
  }, delay));
}

async function walk(root) {
  let count = 0;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      count += await walk(path);
    } else if (entry.isFile() && await record(path, root)) {
      count += 1;
    }
  }
  return count;
}

function startWatcher(root) {
  let watcher;
  try {
    watcher = watchFs(root, { recursive: true }, (_event, filename) => filename && schedule(resolve(root, String(filename)), root));
  } catch {
    watcher = watchFs(root, (_event, filename) => filename && schedule(resolve(root, String(filename)), root));
  }
  watcher.on('error', (error) => console.error(JSON.stringify({ event: 'content.watch-error', root, error: error.message })));
  return watcher;
}

const existingRoots = roots.filter(existsSync);
if (!existingRoots.length) {
  console.error(JSON.stringify({ event: 'content.no-roots', roots }));
  process.exitCode = 1;
} else {
  let imported = 0;
  if (includeExisting) {
    for (const root of existingRoots) imported += await walk(root);
  }
  console.log(JSON.stringify({ event: 'content.ready', roots: existingRoots, imported, watch: watchMode }));

  if (watchMode) {
    const watchers = existingRoots.map(startWatcher);
    const stop = () => {
      for (const watcher of watchers) watcher.close();
      for (const timer of timers.values()) clearTimeout(timer);
      db.close();
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } else {
    db.close();
  }
}
