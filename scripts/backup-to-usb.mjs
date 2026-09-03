import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const usbRoot = process.env.MUSIC_BACKUP_USB || '/Volumes/ADATA SC740';
if (!existsSync(usbRoot)) throw new Error(`USB no disponible: ${usbRoot}`);

const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const destination = resolve(usbRoot, 'Backups/MusicaSoundcloud', stamp);
mkdirSync(destination, { recursive: true });
execFileSync('rsync', ['-a', '--exclude', 'node_modules', '--exclude', '.DS_Store', './', `${destination}/`], { stdio: 'inherit' });
const manifest = execFileSync('find', [destination, '-type', 'f'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).sort().join('\n');
writeFileSync(resolve(destination, 'BACKUP-MANIFEST.txt'), `${manifest}\n`);
console.log(`Respaldo creado: ${destination}`);

