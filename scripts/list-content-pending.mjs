import { openDatabase, getContentStats, listContentInbox } from '../packages/database/src/db.mjs';

const args = new URLSearchParams(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || 'true'];
}));
const db = openDatabase();
const items = listContentInbox(db, {
  status: args.get('status') || 'pending',
  source: args.get('source') || null,
  kind: args.get('kind') || null,
  limit: args.get('limit') || 100,
});
const stats = getContentStats(db);
console.log(JSON.stringify({ stats, items }, null, 2));
db.close();
