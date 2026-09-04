import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateTrackPackage, validateMetadata } from '../packages/pipeline/src/validate-track-package.mjs';

const metadata = {
  metadataStatus: 'ready', coverStatus: 'ready', artist: 'Iyari Gomez',
  recordLabel: 'BlackMamba RECORDS', instrumental: true,
};

async function fixtures(width = 1200, height = 1200) {
  const directory = await mkdtemp(join(tmpdir(), 'blackmamba-package-'));
  const audioPath = join(directory, 'song.wav');
  const artworkPath = join(directory, 'cover.png');
  const wav = Buffer.alloc(45);
  wav.write('RIFF', 0); wav.write('WAVE', 8);
  const png = Buffer.alloc(24);
  png.set([0x89, 0x50, 0x4e, 0x47], 0); png.writeUInt32BE(width, 16); png.writeUInt32BE(height, 20);
  await Promise.all([writeFile(audioPath, wav), writeFile(artworkPath, png)]);
  return { audioPath, artworkPath };
}

test('acepta un paquete completo con portada cuadrada', async () => {
  const files = await fixtures();
  const result = await validateTrackPackage({ ...files, sidecar: metadata, title: 'Canción final' });
  assert.equal(result.ready, true);
  assert.equal(result.stage, 'ready-private-upload');
  assert.deepEqual(result.artwork.width, 1200);
});

test('rechaza portada que no sea 1:1', async () => {
  const files = await fixtures(1200, 1500);
  const result = await validateTrackPackage({ ...files, sidecar: metadata, title: 'Canción final' });
  assert.equal(result.ready, false);
  assert.equal(result.stage, 'invalid-package');
  assert.match(result.errors[0], /1:1/);
});

test('exige identidad y letra o condición instrumental', () => {
  const errors = validateMetadata({ metadataStatus: 'ready', artist: 'Otro', recordLabel: '', instrumental: false }, 'Untitled Project');
  assert.equal(errors.length, 4);
});
