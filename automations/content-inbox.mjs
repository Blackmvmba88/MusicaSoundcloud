import { existsSync, watch as watchFs } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, resolve } from 'node:path';
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
  if (lastSeen.size > 5000) lastSeen.delete(lastSeen.keys().next().value);
}

function recordInfo(path, root, info) {
  if (!info?.isFile() || isPartialDownload(path)) return 'ignored';
  const externalId = fileExternalId(info, path);
  const signature = `${info.size}:${Math.trunc(info.mtimeMs)}`;
  if (lastSeen.get(externalId) === signature) return 'duplicate';

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
  return 'recorded';
}

async function stableInfo(path) {
  if (!existsSync(path)) return { state: 'missing' };
  if (isPartialDownload(path)) return { state: 'partial' };
  const first = await stat(path).catch(() => null);
  if (!first?.isFile()) return { state: 'missing' };
  await new Promise((done) => setTimeout(done, settleMs));
  const second = await stat(path).catch(() => null);
  if (!second?.isFile()) return { state: 'missing' };
  if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) return { state: 'unstable' };
  return { state: 'ready', info: second };
}

async function record(path, root) {
  const stable = await stableInfo(path);
  if (stable.state !== 'ready') return stable.state;
  return recordInfo(path, root, stable.info);
}

function schedule(path, root, delay = 120) {
  if (!path || basename(path).startsWith('.')) return;
  clearTimeout(timers.get(path));
  timers.set(path, setTimeout(async () => {
    timers.delete(path);
    try {
      const state = await record(path, root);
      if (state === 'unstable') schedule(path, root, settleMs);
    } catch (error) {
      console.error(JSON.stringify({ event: 'content.error', path, error: error.message }));
    }
  }, delay));
}

async function walk(root, scanRoot = root) {
  let count = 0;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      count += await walk(path, scanRoot);
      continue;
    }
    if (!entry.isFile() || isPartialDownload(path)) continue;
    const info = await stat(path).catch(() => null);
    if (recordInfo(path, scanRoot, info) === 'recorded') count += 1;
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
