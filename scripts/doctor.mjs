import { accessSync, constants, existsSync } from 'node:fs';
import { openDatabase, defaultDatabasePath } from '../packages/database/src/db.mjs';

const checks = [];
const check = (name, fn) => {
  try { fn(); checks.push([name, true]); }
  catch (error) { checks.push([name, false, error.message]); }
};

check('Node.js >= 24', () => {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error(process.versions.node);
});
check('Base SQLite', () => openDatabase().close());
check('Almacenamiento escribible', () => accessSync(new URL('../storage/', import.meta.url), constants.W_OK));
check('Archivo .env protegido', () => {
  if (existsSync('.env') && !existsSync('.gitignore')) throw new Error('Falta .gitignore');
});

for (const [name, ok, detail] of checks) console.log(`${ok ? 'OK' : 'ERROR'}  ${name}${detail ? ` — ${detail}` : ''}`);
console.log(`DB: ${defaultDatabasePath}`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;

