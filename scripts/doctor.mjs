import { constants, existsSync, readFileSync, statSync } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsonMode = process.argv.includes('--json');
const masterCandidates = [
  process.env.BLACKMAMBA_WAV_MASTER,
  '/Volumes/ADATA SC740/MÚSICA/WAV_MASTER',
  '/Volumes/ADATA SC740/MÚSICA/WAV_MASTER',
].filter(Boolean).map((path) => resolve(path));
const masterRoot = masterCandidates.find(existsSync) || masterCandidates[0];
const results = [];

function record(level, area, name, detail = '') {
  results.push({ level, area, name, detail: String(detail || '') });
}
async function check(area, name, task, options = {}) {
  try { record('ok', area, name, await task()); }
  catch (error) { record(options.optional ? 'warning' : 'error', area, name, error.message); }
}
const command = (program, args, cwd = repositoryRoot) => {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8' });
  if (result.error) throw new Error(result.error.code === 'ENOENT' ? `${program} no está instalado` : result.error.message);
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `código ${result.status}`).trim());
  return result.stdout.trim();
};

await check('runtime', 'Node.js 24 o superior', () => {
  const version = Number(process.versions.node.split('.')[0]);
  if (version < 24) throw new Error(`instalado ${process.version}`);
  return process.version;
});
await check('repository', 'Estructura principal', () => {
  const required = ['apps/player', 'packages/database/src', 'packages/soundcloud/src', 'packages/pipeline/src', 'automations', 'docs', 'storage'];
  const missing = required.filter((path) => !existsSync(resolve(repositoryRoot, path)));
  if (missing.length) throw new Error(`faltan: ${missing.join(', ')}`);
  return `${required.length} áreas presentes`;
});
await check('repository', 'Documentación esencial', () => {
  const required = ['README.md', 'docs/ARCHITECTURE.md', 'docs/PROJECT_CONTEXT.md', 'docs/ROADMAP.md', '.env.example', '.gitignore'];
  const missing = required.filter((path) => !existsSync(resolve(repositoryRoot, path)));
  if (missing.length) throw new Error(`faltan: ${missing.join(', ')}`);
  return `${required.length} documentos presentes`;
});
await check('security', 'Secretos excluidos de Git', () => {
  if (command('git', ['check-ignore', '.env']) !== '.env') throw new Error('.env no está ignorado');
  return '.env ignorado';
});
await check('security', 'Regla privada de SoundCloud', () => {
  const uploader = readFileSync(resolve(repositoryRoot, 'packages/soundcloud/src/client.mjs'), 'utf8');
  if (!uploader.includes("form.set('track[sharing]', 'private')")) throw new Error('no está fijada en el cliente');
  if (process.env.SOUNDCLOUD_AUTO_SHARING && process.env.SOUNDCLOUD_AUTO_SHARING !== 'private')
    throw new Error(`configurada como ${process.env.SOUNDCLOUD_AUTO_SHARING}`);
  return 'private obligatorio';
});
await check('security', 'Permisos de .env', () => {
  const path = resolve(repositoryRoot, '.env');
  if (!existsSync(path)) throw new Error('no existe; parte de .env.example');
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error(`permisos demasiado abiertos: ${mode.toString(8)}`);
  return mode.toString(8);
}, { optional: true });
await check('soundcloud', 'Credenciales configuradas', () => {
  const envPath = resolve(repositoryRoot, '.env');
  if (!existsSync(envPath)) throw new Error('integración remota no configurada');
  const env = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const split = line.indexOf('=');
    return split < 0 ? [line, ''] : [line.slice(0, split), line.slice(split + 1)];
  }));
  const missing = ['SOUNDCLOUD_CLIENT_ID', 'SOUNDCLOUD_CLIENT_SECRET', 'SOUNDCLOUD_ACCESS_TOKEN'].filter((key) => !env[key]);
  if (missing.length) throw new Error(`faltan ${missing.join(', ')}`);
  return 'presentes; valores ocultos';
}, { optional: true });
await check('storage', 'Directorio local escribible', async () => {
  await access(resolve(repositoryRoot, 'storage'), constants.R_OK | constants.W_OK);
  return 'lectura y escritura disponibles';
});
await check('storage', 'Maestro WAV en USB', async () => {
  if (!masterRoot || !existsSync(masterRoot)) throw new Error('ADATA SC740 / WAV_MASTER no está montado');
  const entries = await readdir(masterRoot, { withFileTypes: true });
  const wavs = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('._') && /\.wav$/i.test(entry.name));
  if (!wavs.length) throw new Error('no contiene WAV');
  return `${wavs.length} WAV · ${masterRoot}`;
}, { optional: true });
await check('storage', 'Fichas de canciones legibles', async () => {
  if (!masterRoot || !existsSync(masterRoot)) throw new Error('USB no disponible');
  const names = (await readdir(masterRoot)).filter((name) => name.endsWith('.wav.suno.json'));
  let invalid = 0;
  for (const name of names) {
    try { JSON.parse(await readFile(resolve(masterRoot, name), 'utf8')); } catch { invalid += 1; }
  }
  if (invalid) throw new Error(`${invalid} fichas JSON inválidas`);
  return `${names.length} fichas válidas`;
}, { optional: true });
await check('database', 'SQLite accesible', async () => {
  const path = resolve(repositoryRoot, 'storage/database/music.sqlite');
  if (!existsSync(path)) throw new Error('aún no inicializada; ejecuta npm run db:init');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (integrity.integrity_check !== 'ok') throw new Error(integrity.integrity_check);
  } finally { db.close(); }
  return 'integridad correcta';
}, { optional: true });
await check('automation', 'Sintaxis del cargador privado', () => command(process.execPath, ['--check', 'automations/suno-private-upload.mjs']));
await check('automation', 'Checkpoint de detección', async () => {
  const path = resolve(repositoryRoot, 'storage/sync/suno-new-tracks.json');
  if (!existsSync(path)) throw new Error('se creará en la primera detección');
  const state = JSON.parse(await readFile(path, 'utf8'));
  return `${state.tracks?.length || 0} IDs · ${state.lastSuccessfulCheckAt || state.lastCheckedAt || 'sin fecha'}`;
}, { optional: true });
await check('player', 'Dependencias instaladas', () => {
  if (!existsSync(resolve(repositoryRoot, 'apps/player/node_modules/react'))) throw new Error('ejecuta npm run player:install');
  return 'React y Electron disponibles';
}, { optional: true });
await check('git', 'Repositorio remoto', () => command('git', ['remote', 'get-url', 'origin']), { optional: true });
await check('git', 'Árbol de trabajo', () => {
  const changes = command('git', ['status', '--porcelain']);
  if (changes) throw new Error(`${changes.split(/\r?\n/).length} cambios sin commit`);
  return 'limpio';
}, { optional: true });
await check('containers', 'Docker', () => command('docker', ['version', '--format', '{{.Server.Version}}']), { optional: true });

const counts = {
  ok: results.filter((item) => item.level === 'ok').length,
  warnings: results.filter((item) => item.level === 'warning').length,
  errors: results.filter((item) => item.level === 'error').length,
};
if (jsonMode) console.log(JSON.stringify({ healthy: counts.errors === 0, checkedAt: new Date().toISOString(), counts, results }, null, 2));
else {
  for (const item of results) {
    const symbol = item.level === 'ok' ? 'OK   ' : item.level === 'warning' ? 'AVISO' : 'ERROR';
    console.log(`${symbol}  ${item.area.padEnd(10)} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
  }
  console.log(`\nSalud: ${counts.errors ? 'requiere atención' : 'estable'} · ${counts.ok} correctos · ${counts.warnings} avisos · ${counts.errors} errores`);
}
if (counts.errors) process.exitCode = 1;
