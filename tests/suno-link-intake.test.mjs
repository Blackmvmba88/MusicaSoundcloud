import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSunoLink, importSunoLinks } from '../automations/suno-link-intake.mjs';

async function isolated(fn) {
  const root = await mkdtemp(join(tmpdir(), 'bm-suno-links-'));
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE tracks (id INTEGER PRIMARY KEY, suno_id TEXT, suno_url TEXT)');
  const file = join(root, 'suno-links.json');
  try { return await fn(db, file); }
  finally { db.close(); await rm(root, { recursive: true, force: true }); }
}

test('share URL is not canonical song ID; query tracking is stripped', () => {
  assert.deepEqual(parseSunoLink('https://www.suno.com/s/heo74Dpr07HTwQhP?utm_source=share'), {
    url: 'https://suno.com/s/heo74Dpr07HTwQhP',
    kind: 'share', shareToken: 'heo74Dpr07HTwQhP', sunoId: null,
  });
});
test('canonical song URLs retain song ID', () => {
  const parsed = parseSunoLink('https://suno.com/song/aabbccdd-1234-4444-9999-abcdef123456');
  assert.equal(parsed.sunoId, 'aabbccdd-1234-4444-9999-abcdef123456');
  assert.equal(parsed.kind, 'song');
});
test('rejects arbitrary destinations, credentials and other URL paths', () => {
  for (const x of ['https://suno.com.evil.example/s/heo74Dpr07HTwQhP',
    'http://suno.com/s/heo74Dpr07HTwQhP', 'https://evil@suno.com/s/heo74Dpr07HTwQhP',
    'https://suno.com/api/tracks', 'https://suno.com/s/a'])
    assert.throws(() => parseSunoLink(x));
});
test('import is idempotent; short share link waits for real identity', async () => isolated(async(db,file) => {
  await writeFile(file, JSON.stringify({ version: 1, links: [
    { url: 'https://suno.com/s/heo74Dpr07HTwQhP' },
    { url: 'https://www.suno.com/s/heo74Dpr07HTwQhP?utm_source=abc' },
  ] }));
  const first = await importSunoLinks(db, file);
  assert.equal(first.imported, 1);
  assert.equal(first.pending, 1);
  assert.equal(first.linked, 0);
  assert.equal((await importSunoLinks(db, file)).imported, 0);
  const row = db.prepare('SELECT * FROM release_source_links').get();
  assert.equal(row.suno_id, null);
  assert.equal(row.status, 'awaiting_identity');
}));
test('canonical song URL and matching share URL link only when track known', async () => isolated(async(db,file) => {
  db.prepare('INSERT INTO tracks(id, suno_id, suno_url) VALUES (?,?,?)').run(41,
    'aabbccdd-1234-4444-9999-abcdef123456','https://suno.com/s/heo74Dpr07HTwQhP');
  await writeFile(file, JSON.stringify({version:1,links:[
    'https://suno.com/song/aabbccdd-1234-4444-9999-abcdef123456',
    'https://suno.com/s/heo74Dpr07HTwQhP',
  ]}));
  const res = await importSunoLinks(db,file);
  assert.equal(res.imported, 2);
  assert.equal(res.linked, 2);
  assert.equal(res.pending, 0);
  const matches = db.prepare('SELECT track_id FROM release_source_links').all();
  assert.deepEqual(matches.map(x=>x.track_id),[41,41]);
}));
test('malformed inbox throws before writing any entry', async () => isolated(async(db,file) => {
  await writeFile(file, JSON.stringify({version:1,links:['https://not-suno.com/a']}));
  await assert.rejects(() => importSunoLinks(db,file));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='release_source_links'").get().n,0);
}));
