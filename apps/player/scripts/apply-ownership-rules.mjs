import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const libraryRoot = '/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
const manifestPath = join(libraryRoot, 'library.json');
const library = JSON.parse(await readFile(manifestPath, 'utf8'));
const rules = [{ field: 'artist_or_metadata', contains: 'neocyber', owner: 'BlackMamba', reason: 'Identidad confirmada por el propietario de la biblioteca' }];
let marked = 0;

for (const track of library.tracks) {
  if (!JSON.stringify(track).toLowerCase().includes('neocyber')) continue;
  track.ownership = { status: 'belongs', owner: 'BlackMamba', matchedRule: 'contains:neocyber', confirmedAt: new Date().toISOString(), confidence: 1, evidence: ['Identidad neocyber confirmada explícitamente por el propietario'], warnings: [], fallbackReason: null };
  marked += 1;
}
library.ownershipRules = { updatedAt: new Date().toISOString(), rules, marked, confidence: 1, evidence: ['Regla explícita del propietario'], warnings: [], fallbackReason: null };
await writeFile(manifestPath, `${JSON.stringify(library, null, 2)}\n`);
console.log(JSON.stringify({ marked, total: library.tracks.length }, null, 2));
