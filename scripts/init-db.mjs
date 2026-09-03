import { openDatabase, defaultDatabasePath } from '../packages/database/src/db.mjs';

const db = openDatabase();
db.close();
console.log(`Base de datos lista: ${defaultDatabasePath}`);

