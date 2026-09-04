import { createHash } from 'node:crypto';
import { readdir, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const libraryRoot = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(libraryRoot, 'library.json');
const cleanupRoots = [
  '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BlackMamba_Music_Arsenal/MP3_Distribution',
  '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BlackMamba_Music_Arsenal/MP3',
  '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BlackMamba_Music_Vault/MP3_Distribution',
];
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const library = JSON.parse(await readFile(manifestPath, 'utf8'));
const deleted = [];
const preserved = [];

for (const track of library.tracks) {
  const canonical = join(libraryRoot, track.folder, 'audio.mp3');
  if (await sha256(canonical) !== track.sha256) throw new Error(`Canónico inválido: ${canonical}`);
  for (const source of track.variants ?? []) {
    if (!cleanupRoots.some((root) => source.startsWith(`${root}/`))) continue;
    try {
      const sourceHash = await sha256(source);
      if (sourceHash !== track.sha256) { preserved.push({ source, reason: 'hash_changed' }); continue; }
      const bytes = (await stat(source)).size;
      await rm(source);
      deleted.push({ source, sha256: sourceHash, bytes });
    } catch (error) {
      if (error.code !== 'ENOENT') preserved.push({ source, reason: error.message });
    }
  }
}

async function removeEmptyDirectories(directory, root = directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) if (entry.isDirectory()) await removeEmptyDirectories(join(directory, entry.name), root);
  if (directory !== root) {
    try { if ((await readdir(directory)).length === 0) await rmdir(directory); } catch { /* directory is not empty or disappeared concurrently */ }
  }
}
for (const root of cleanupRoots) await removeEmptyDirectories(root);

const freedBytes = deleted.reduce((total, item) => total + item.bytes, 0);
const audit = {
  completedAt: new Date().toISOString(), cleanupRoots, deletedFiles: deleted.length, freedBytes, preserved,
  confidence: preserved.length ? 0.95 : 1,
  evidence: ['Cada audio canónico fue verificado', 'Cada copia histórica fue cotejada por SHA-256 antes de borrarse'],
  warnings: preserved.length ? ['Algunas copias cambiaron o no pudieron borrarse'] : [], fallbackReason: null,
};
library.usbDuplicateCleanup = audit;
await writeFile(manifestPath, `${JSON.stringify(library, null, 2)}\n`);
await writeFile(join(libraryRoot, 'cleanup-audit.json'), `${JSON.stringify({ ...audit, deleted }, null, 2)}\n`);
console.log(JSON.stringify({ deletedFiles: deleted.length, preservedFiles: preserved.length, freedGiB: +(freedBytes / 1024 ** 3).toFixed(2) }, null, 2));
