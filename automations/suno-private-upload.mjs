import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, watch as watchFs, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { attachLocalPathToSunoTrack, openDatabase } from '../packages/database/src/db.mjs';
import { SoundCloudClient } from '../packages/soundcloud/src/client.mjs';
import { validateTrackPackage } from '../packages/pipeline/src/validate-track-package.mjs';

if (existsSync('.env')) loadEnvFile('.env');

const argv = new Set(process.argv.slice(2));
const apply = argv.has('--apply');
const watch = argv.has('--watch');
const includeExisting = argv.has('--include-existing');
const fileArg = process.argv.find((value) => value.startsWith('--file='))?.slice(7);
const root = resolve(process.env.BLACKMAMBA_WAV_MASTER || '/Volumes/ADATA SC740/MÚSICA/WAV_MASTER');
const statePath = resolve('storage/sync/suno-private-upload.json');
const database = openDatabase();

if (process.env.SOUNDCLOUD_AUTO_SHARING && process.env.SOUNDCLOUD_AUTO_SHARING !== 'private') {
  throw new Error('Regla rechazada: SOUNDCLOUD_AUTO_SHARING debe ser private');
}

const emptyState = () => ({ version: 1, rule: 'private-only', baselineCreatedAt: null, files: {} });
const loadState = () => {
  try { return { ...emptyState(), ...JSON.parse(readFileSync(statePath, 'utf8')) }; }
  catch { return emptyState(); }
};
const saveState = async (state) => {
  await mkdir(dirname(statePath), { recursive: true });
  const temporary = `${statePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, statePath);
};
const sha256 = async (file) => {
  const hash = createHash('sha256');
  await new Promise((done, fail) => createReadStream(file)
    .on('data', (chunk) => hash.update(chunk))
    .on('end', done)
    .on('error', fail));
  return hash.digest('hex');
};
const cleanTitle = (file) => basename(file, extname(file))
  .replace(/--[a-f0-9]{12}$/i, '')
  .replace(/\s*\[[a-f0-9-]{8,36}\]$/i, '')
  .trim() || 'Sin título';
const sidecarFor = (file) => `${file}.suno.json`;
const readSidecar = async (file) => {
  try { return JSON.parse(await readFile(sidecarFor(file), 'utf8')); }
  catch { return {}; }
};
const coverFor = (file, sidecar) => sidecar.coverPath ? resolve(dirname(file), sidecar.coverPath) : null;
const saveEnvTokens = (tokens) => {
  const envPath = resolve('.env');
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  const updates = { SOUNDCLOUD_ACCESS_TOKEN: tokens.access_token, SOUNDCLOUD_REFRESH_TOKEN: tokens.refresh_token };
  const seen = new Set();
  const next = lines.map((line) => {
    const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
    if (!key || !updates[key]) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, value] of Object.entries(updates)) if (value && !seen.has(key)) next.push(`${key}=${value}`);
  writeFileSync(envPath, `${next.filter(Boolean).join('\n')}\n`, { mode: 0o600 });
};
const refreshToken = async () => {
  const response = await fetch('https://secure.soundcloud.com/oauth/token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.SOUNDCLOUD_CLIENT_ID || '',
      client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET || '',
      refresh_token: process.env.SOUNDCLOUD_REFRESH_TOKEN || '',
    }),
  });
  const tokens = await response.json().catch(() => ({}));
  if (!response.ok || !tokens.access_token) throw new Error(`No se pudo renovar SoundCloud OAuth (${response.status})`);
  saveEnvTokens(tokens);
  Object.assign(process.env, { SOUNDCLOUD_ACCESS_TOKEN: tokens.access_token, SOUNDCLOUD_REFRESH_TOKEN: tokens.refresh_token });
  return tokens.access_token;
};
const client = async () => {
  let api = new SoundCloudClient(process.env.SOUNDCLOUD_ACCESS_TOKEN);
  try { await api.me(); }
  catch (error) {
    if (error.status !== 401) throw error;
    api = new SoundCloudClient(await refreshToken());
  }
  return api;
};

async function processFile(file, state) {
  const absolute = resolve(file);
  if (!absolute.startsWith(`${root}/`) || extname(absolute).toLowerCase() !== '.wav' || basename(absolute).startsWith('._')) return null;
  const info = await stat(absolute);
  if (!info.isFile() || info.size < 44) return null;
  const hash = await sha256(absolute);
  const duplicate = Object.values(state.files).find((item) => item.sha256 === hash && item.status === 'uploaded');
  if (duplicate || state.files[absolute]?.status === 'uploaded') return { file: absolute, status: 'duplicate', soundcloudUrl: duplicate?.soundcloudUrl || state.files[absolute]?.soundcloudUrl };
  const sidecar = await readSidecar(absolute);
  const title = sidecar.title || cleanTitle(absolute);
  const sunoUrl = sidecar.sunoUrl || (sidecar.id ? `https://suno.com/song/${sidecar.id}` : null);
  if (sidecar.id) attachLocalPathToSunoTrack(database, {
    sunoId: sidecar.id,
    localPath: absolute,
    title,
    artist: sidecar.artist || 'Iyari Gomez',
  });
  const artworkPath = coverFor(absolute, sidecar);
  const readiness = await validateTrackPackage({ audioPath: absolute, artworkPath, sidecar, title });
  if (!readiness.ready) {
    const entry = {
      ...(state.files[absolute] || {}), sha256: hash, sunoId: sidecar.id || null, sunoUrl, title,
      status: readiness.stage, validationErrors: readiness.errors, sharing: 'private', observedAt: new Date().toISOString(),
    };
    if (apply) { state.files[absolute] = entry; await saveState(state); }
    return { file: absolute, ...entry };
  }
  if (!apply) return { file: absolute, title, sunoUrl, sharing: 'private', status: 'would-upload' };
  const api = await client();
  const uploaded = await api.uploadTrack(absolute, {
    title,
    artist: sidecar.artist || 'Iyari Gomez',
    artworkPath,
    genre: sidecar.genre || sidecar.style || '',
    tagList: sidecar.tags || '',
    description: [
      'Iyari Gomez',
      sidecar.recordLabel || 'BlackMamba RECORDS',
      sunoUrl && `Origen Suno: ${sunoUrl}`,
      sidecar.lyrics,
    ].filter(Boolean).join('\n\n'),
  });
  const entry = {
    sha256: hash, sunoId: sidecar.id || null, sunoUrl, title,
    soundcloudId: String(uploaded.urn || uploaded.id), soundcloudUrl: uploaded.permalink_url || null,
    sharing: 'private', status: 'uploaded', uploadedAt: new Date().toISOString(),
  };
  state.files[absolute] = entry;
  await saveState(state);
  return { file: absolute, ...entry };
}

async function wavFiles() {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('._') && /\.wav$/i.test(entry.name))
    .map((entry) => join(root, entry.name));
}
async function scan() {
  const state = loadState();
  const files = fileArg ? [resolve(fileArg)] : await wavFiles();
  if (!state.baselineCreatedAt && !includeExisting && !fileArg) {
    for (const file of files) state.files[file] = { status: 'baseline', observedAt: new Date().toISOString() };
    state.baselineCreatedAt = new Date().toISOString();
    await saveState(state);
    return [{ status: 'baseline-created', files: files.length, sharing: 'private' }];
  }
  const results = [];
  for (const file of files) {
    if (state.files[file]?.status === 'baseline' || state.files[file]?.status === 'uploaded') continue;
    try { const result = await processFile(file, state); if (result) results.push(result); }
    catch (error) { results.push({ file, status: 'error', error: error.message }); }
  }
  return results;
}

const report = async () => console.log(JSON.stringify({ checkedAt: new Date().toISOString(), mode: apply ? 'apply-private' : 'dry-run', results: await scan() }, null, 2));
let running = false;
let rerun = false;
let debounceTimer = null;

async function runReport() {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      await report();
    } while (rerun);
  } finally {
    running = false;
  }
}

function scheduleReport(delay = 350) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runReport().catch((error) => console.error(error)), delay);
}

await runReport();
if (watch) {
  const watcher = watchFs(root, (_event, filename) => {
    if (!filename) return scheduleReport(500);
    const name = String(filename);
    if (/\.wav$/i.test(name) || /\.wav\.suno\.json$/i.test(name) || /\.(png|jpe?g|webp)$/i.test(name)) scheduleReport();
  });
  // fs.watch es el camino caliente; este barrido solo cubre eventos perdidos o unidades externas raras.
  const safety = setInterval(() => scheduleReport(0), 300_000);
  const stop = () => {
    clearInterval(safety);
    clearTimeout(debounceTimer);
    watcher.close();
    database.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  database.close();
}
