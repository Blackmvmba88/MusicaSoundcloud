import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../packages/database/src/db.mjs';
import { planRelease, mapMediaPath, persistReleasePlan, scanOnce } from '../automations/release-worker.mjs';
import { discoverLocalMedia } from '../automations/worker-media-discovery.mjs';

test('plan: WAV ausente, ficha incompleta y aprobado mantienen estados independientes', () => {
  assert.equal(planRelease({ hasAudio: false }).state, 'awaiting_wav');
  assert.equal(planRelease({ hasAudio: false }).blockers[0].code, 'WAV_MISSING');
  const missing = planRelease({ hasAudio: true, validation: {
    ready: false, stage: 'waiting-cover', errors: ['falta portada'],
  } });
  assert.equal(missing.state, 'preparing');
  assert.equal(missing.readiness, 'incomplete');
  assert.equal(missing.blockers[0].code, 'COVER_MISSING');
  const ready = planRelease({ hasAudio: true, validation: { ready: true } });
  assert.equal(ready.state, 'ready_for_review');
  assert.equal(ready.readiness, 'complete');
  assert.deepEqual(ready.blockers, []);
});

test('rutas fuera del volumen /music no son aceptadas', () => {
  const cfg = { media: '/music', sourcePrefix: '/Volumes/Music/WAV_MASTER' };
  assert.equal(mapMediaPath('/Volumes/Music/WAV_MASTER/single.wav', cfg), '/music/single.wav');
  assert.equal(mapMediaPath('/Volumes/Music/WAV_MASTER/../private.wav', cfg), null);
  assert.equal(mapMediaPath('/etc/passwd', cfg), null);
});

test('transiciones, bloqueos y aprobación protegida son idempotentes', () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-worker-db-'));
  const db = openDatabase(join(root, 'music.sqlite'));
  try {
    db.prepare('INSERT INTO tracks (title, artist, suno_id) VALUES (?, ?, ?)').run('Joyita', 'Iyari Gomez', 'aaaaaaaa-1111-4444-8888-bbbbbbbbbbbb');
    const track = db.prepare('SELECT * FROM tracks LIMIT 1').get();
    const waiting = planRelease({ hasAudio: false });
    assert.equal(persistReleasePlan(db, track, waiting).changed, true);
    assert.equal(persistReleasePlan(db, track, waiting).changed, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_jobs').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_transitions').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_blockers').get().n, 1);
    assert.equal(persistReleasePlan(db, track, planRelease({ hasAudio: true, validation: { ready: true } })).changed, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_transitions').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_blockers').get().n, 0);
    db.exec("UPDATE release_jobs SET state='approved' WHERE track_id = 1");
    assert.equal(persistReleasePlan(db, track, waiting).protected, true);
    assert.equal(db.prepare('SELECT state FROM release_jobs').get().state, 'approved');
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('WAV y ficha se descubren; se guardan en SQLite y sobreviven un reinicio', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-worker-media-'));
  const media = join(root, 'music');
  mkdirSync(media);
  const audio = join(media, 'hidden-gem.wav');
  const wav = Buffer.alloc(60);
  wav.write('RIFF', 0, 'ascii');
  wav.write('WAVE', 8, 'ascii');
  writeFileSync(audio, wav);
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(64, 16); png.writeUInt32BE(64, 20);
  writeFileSync(join(media, 'cover.png'), png);
  const id = 'b1234567-1234-1234-1234-123456789abc';
  writeFileSync(audio + '.suno.json', JSON.stringify({
    id, title: 'Hidden Gem', artist: 'Iyari Gomez', recordLabel: 'BlackMamba RECORDS',
    metadataStatus: 'ready', instrumental: true, coverStatus: 'ready', coverPath: 'cover.png',
  }));
  const dbpath = join(root, 'music.sqlite');
  const config = { media, batch: 10, sourcePrefix: '/Volumes/Music', catalog: join(root, 'missing.json') };
  let db;
  try {
    db = openDatabase(dbpath);
    const discovery = await discoverLocalMedia(db, config);
    assert.equal(discovery.discovered, 1);
    const track = db.prepare('SELECT * FROM tracks WHERE suno_id = ?').get(id);
    assert.equal(track.local_path, audio);
    const first = await scanOnce(db, config);
    assert.equal(first.errors, 0);
    assert.equal(db.prepare('SELECT state FROM release_jobs').get().state, 'ready_for_review');
    assert.equal(db.prepare('SELECT readiness FROM release_jobs').get().readiness, 'complete');
    db.close(); db = null; db = openDatabase(dbpath);
    await scanOnce(db, config);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_jobs').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_transitions').get().n, 1);
  } finally { db?.close(); rmSync(root, { recursive: true, force: true }); }
});

test('a sidecar arriving after its WAV reconciles the already discovered local track', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-worker-late-'));
  const media = join(root, 'media'); mkdirSync(media);
  const wavPath = join(media, 'late.wav');
  const wavBytes = Buffer.alloc(60); wavBytes.write('RIFF',0); wavBytes.write('WAVE',8);
  writeFileSync(wavPath,wavBytes);
  const db = openDatabase(join(root,'music.sqlite'));
  const id = 'aabbccdd-1111-4444-9999-123456789abc';
  try {
    assert.equal((await discoverLocalMedia(db,{media,batch:10})).discovered,1);
    const before = db.prepare('SELECT id,suno_id FROM tracks WHERE local_path=?').get(wavPath);
    assert.equal(before.suno_id,null);
    writeFileSync(wavPath+'.suno.json', JSON.stringify({id,title:'Later',artist:'Iyari Gomez'}));
    assert.equal((await discoverLocalMedia(db,{media,batch:10})).discovered,1);
    const after = db.prepare('SELECT * FROM tracks WHERE local_path=?').get(wavPath);
    assert.equal(after.suno_id,id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); rmSync(root,{recursive:true,force:true}); }
});

test('an original Mac catalog path survives while the worker validates a hash-named WAV copy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-worker-alias-'));
  const media = join(root, 'media'); mkdirSync(media);
  const id = 'aabbccdd-2222-4444-9999-123456789abc';
  const originalPath = '/Volumes/Music/WAV_MASTER/original-name.wav';
  const wavPath = join(media, 'renamed--abcd1234.wav');
  const wavBytes = Buffer.alloc(60); wavBytes.write('RIFF',0); wavBytes.write('WAVE',8);
  writeFileSync(wavPath,wavBytes);
  const png = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
  png.writeUInt32BE(64,16); png.writeUInt32BE(64,20);
  writeFileSync(join(media, 'cover.png'),png);
  writeFileSync(wavPath+'.suno.json',JSON.stringify({
    id,title:'Copied',artist:'Iyari Gomez',recordLabel:'BlackMamba RECORDS',
    metadataStatus:'ready',instrumental:true,coverStatus:'ready',coverPath:'cover.png',
  }));
  const db = openDatabase(join(root,'music.sqlite'));
  try {
    db.prepare('INSERT INTO tracks(title,artist,suno_id,local_path) VALUES (?,?,?,?)')
      .run('Copied','Iyari Gomez',id,originalPath);
    const config = {media,batch:10,sourcePrefix:'/Volumes/Music/WAV_MASTER',catalog:join(root,'missing.json'),
      links:join(root,'missing-links.json')};
    const report = await scanOnce(db,config);
    assert.equal(report.errors,0);
    assert.equal(report.mediaScan.aliases,1);
    assert.equal(db.prepare('SELECT local_path FROM tracks WHERE suno_id=?').get(id).local_path,originalPath);
    assert.equal(db.prepare('SELECT media_path FROM release_worker_media_aliases').get().media_path,wavPath);
    assert.equal(db.prepare('SELECT state FROM release_jobs').get().state,'ready_for_review');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close(); rmSync(root,{recursive:true,force:true});}
});
