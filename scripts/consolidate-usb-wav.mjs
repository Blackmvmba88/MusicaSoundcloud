import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const apply = process.argv.includes('--apply');
const usb = '/Volumes/ADATA SC740';
const target = `${usb}/MÚSICA/WAV_MASTER`;
const repoBackups = `${usb}/Backups/MusicaSoundcloud`;
const sourceRoots = [
  `${usb}/RESPALDOS`,
  `${usb}/MÚSICA/BLACKMAMBA_LIBRARY/backups`,
  `${usb}/MÚSICA/SUNO/00_SUNO_HUB/03_ARCHIVES`,
].filter(existsSync);

function walk(directory) {
  const result = [];
  let entries = [];
  try { entries = readdirSync(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EACCES') return result;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('._')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else if (entry.isFile() && ['.wav', '.wave'].includes(extname(entry.name).toLowerCase())) result.push(path);
  }
  return result;
}

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')));
  });
}

function safeName(path, hash) {
  const name = basename(path, extname(path)).normalize('NFC').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'sin-titulo';
  return `${name}--${hash.slice(0, 12)}.wav`;
}

const sources = sourceRoots.flatMap(walk).filter((path) => !path.startsWith(`${target}/`));
console.log(`WAV encontrados en respaldos: ${sources.length}`);
if (!apply) {
  console.log(`Simulacion. Destino: ${target}`);
  console.log('Ejecuta con --apply para copiar, verificar y retirar originales.');
  process.exit(0);
}

mkdirSync(target, { recursive: true });
const byHash = new Map();
const records = [];
for (let index = 0; index < sources.length; index += 1) {
  const source = sources[index];
  const hash = await sha256(source);
  let destination = byHash.get(hash);
  let duplicate = Boolean(destination);
  if (!destination) {
    destination = join(target, safeName(source, hash));
    if (existsSync(destination)) {
      const existingHash = await sha256(destination);
      if (existingHash !== hash) destination = join(target, `${basename(destination, '.wav')}-${index}.wav`);
    }
    if (!existsSync(destination)) copyFileSync(source, destination);
    const copiedHash = await sha256(destination);
    if (copiedHash !== hash) throw new Error(`Fallo de verificacion: ${source}`);
    byHash.set(hash, destination);
  }
  records.push({ source, destination, sha256: hash, bytes: statSync(source).size, duplicate });
  if ((index + 1) % 25 === 0 || index + 1 === sources.length) console.log(`Verificados ${index + 1}/${sources.length}`);
}

for (const record of records) rmSync(record.source);
if (existsSync(repoBackups)) rmSync(repoBackups, { recursive: true, force: true });
const parent = resolve(repoBackups, '..');
if (existsSync(parent) && readdirSync(parent).length === 0) rmSync(parent, { recursive: true });

const report = {
  completedAt: new Date().toISOString(),
  target,
  sourceFiles: records.length,
  uniqueWav: byHash.size,
  duplicatesRemoved: records.length - byHash.size,
  verifiedBytes: records.reduce((sum, record) => sum + record.bytes, 0),
  removedRepoBackupDirectory: repoBackups,
  records,
};
writeFileSync('reports/usb-wav-consolidation.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ target, sourceFiles: report.sourceFiles, uniqueWav: report.uniqueWav, duplicatesRemoved: report.duplicatesRemoved }, null, 2));
