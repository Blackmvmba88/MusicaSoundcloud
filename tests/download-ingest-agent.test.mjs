import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isCandidate, scanDownloadsOnce } from '../automations/download-ingest-agent.mjs';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'blackmamba-ingest-'));
  const downloads = join(root, 'Downloads'), media = join(root, 'media');
  const statePath = join(root, 'state', 'ingest.json');
  await mkdir(downloads); await mkdir(media);
  const config = { downloads, media, statePath, minAgeMs: 100 };
  try { return await fn({ ...config, root }); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(96, 0)]);

test('audio extensions only; temporary and hidden files excluded', () => {
  assert.equal(isCandidate('My Track.WAV'), true);
  assert.equal(isCandidate('demo.m4a'), true);
  assert.equal(isCandidate('track.flac'), true);
  assert.equal(isCandidate('song.mp3.crdownload'), false);
  assert.equal(isCandidate('secrets.env'), false);
  assert.equal(isCandidate('.hidden.mp3'), false);
});

test('two stable observations before staging a WAV', async () => fixture(async cfg => {
  const src = join(cfg.downloads, 'Joyita.wav');
  await writeFile(src, wav);
  const now = Date.now();
  assert.equal((await scanDownloadsOnce(cfg, now)).waiting, 1);
  assert.equal((await readdir(cfg.media)).length, 0);
  assert.equal((await scanDownloadsOnce(cfg, now + 40)).waiting, 1);
  const ready = await scanDownloadsOnce(cfg, now + 1000);
  assert.equal(ready.staged, 1);
  const files = await readdir(cfg.media);
  assert.equal(files.length, 1);
  assert.match(files[0], /^Joyita--[a-f0-9]{16}\.wav$/);
  assert.deepEqual(await readFile(src), await readFile(join(cfg.media, files[0])));
  assert.equal((await scanDownloadsOnce(cfg, now + 1100)).staged, 0);
}));

test('renaming a previous WAV never stages a duplicate after restart', async () => fixture(async cfg => {
  const a = join(cfg.downloads, 'one.wav');
  await writeFile(a, wav);
  const now = Date.now();
  await scanDownloadsOnce(cfg, now);
  await scanDownloadsOnce(cfg, now + 1000);
  await copyFile(a, join(cfg.downloads, 'two.wav'));
  await scanDownloadsOnce(cfg, now + 1200);
  const report = await scanDownloadsOnce(cfg, now + 2400);
  assert.equal(report.duplicates, 1);
  assert.equal((await readdir(cfg.media)).length, 1);
  const state = JSON.parse(await readFile(cfg.statePath, 'utf8'));
  assert.equal(Object.keys(state.byHash).length, 1);
}));

test('MP3 must wait for WAV conversion and cannot be called ready', async () => fixture(async cfg => {
  await writeFile(join(cfg.downloads, 'demo.mp3'), Buffer.from('ID3mock-audio'));
  const now = Date.now();
  await scanDownloadsOnce(cfg, now);
  await scanDownloadsOnce(cfg, now + 2000);
  assert.equal((await readdir(join(cfg.media, 'pending-import'))).length, 1);
  assert.equal((await readdir(cfg.media)).filter(s => s.endsWith('.wav')).length, 0);
  const state = JSON.parse(await readFile(cfg.statePath, 'utf8'));
  assert.equal(Object.values(state.byHash)[0].status, 'awaiting-wav-conversion');
}));

test('a Suno sidecar arriving later is attached without overwriting WAV', async () => fixture(async cfg => {
  const a = join(cfg.downloads, 'ready.wav');
  await writeFile(a, wav);
  const now = Date.now();
  await scanDownloadsOnce(cfg, now);
  await scanDownloadsOnce(cfg, now + 1000);
  const name = (await readdir(cfg.media))[0];
  const json = { title: 'Ready', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
  await writeFile(a + '.suno.json', JSON.stringify(json));
  assert.equal((await scanDownloadsOnce(cfg, now + 2100)).sidecars, 1);
  assert.deepEqual(JSON.parse(await readFile(join(cfg.media, name) + '.suno.json', 'utf8')), json);
}));

test('modified content creates a new immutable artifact', async () => fixture(async cfg => {
  const a = join(cfg.downloads, 'versions.wav'), now = Date.now();
  await writeFile(a, wav);
  await scanDownloadsOnce(cfg, now);
  await scanDownloadsOnce(cfg, now + 1000);
  await writeFile(a, Buffer.concat([wav, Buffer.from('new version')]));
  await scanDownloadsOnce(cfg, now + 1200);
  await scanDownloadsOnce(cfg, now + 2400);
  assert.equal((await readdir(cfg.media)).length, 2);
}));

test('invalid journal never resets silently', async () => fixture(async cfg => {
  await mkdir(join(cfg.root, 'state'));
  await writeFile(cfg.statePath, '{invalid');
  await assert.rejects(() => scanDownloadsOnce(cfg), /Checkpoint ilegible/);
}));

test('symlinks and unrelated files remain untouched', async () => fixture(async cfg => {
  await writeFile(join(cfg.root, 'outside.wav'), wav);
  await symlink(join(cfg.root, 'outside.wav'), join(cfg.downloads, 'linked.wav'));
  await writeFile(join(cfg.downloads, 'bank.csv'), 'not music');
  const report = await scanDownloadsOnce(cfg);
  assert.equal(report.examined, 0);
  assert.equal((await readdir(cfg.media)).length, 0);
}));
