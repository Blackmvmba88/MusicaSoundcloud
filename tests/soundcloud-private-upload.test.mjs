import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SoundCloudClient } from '../packages/soundcloud/src/client.mjs';

test('adjunta WAV y portada y fuerza la pista como privada', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blackmamba-sc-'));
  const audioPath = join(directory, 'song.wav');
  const artworkPath = join(directory, 'cover.png');
  await writeFile(audioPath, Buffer.alloc(44));
  await writeFile(artworkPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  let request;
  const fetchMock = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 123, permalink_url: 'https://soundcloud.com/private-track' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const client = new SoundCloudClient('test-token', fetchMock);
  await client.uploadTrack(audioPath, { title: 'Canción de prueba', artworkPath });

  assert.equal(request.url, 'https://api.soundcloud.com/tracks');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.body.get('track[title]'), 'Canción de prueba');
  assert.equal(request.options.body.get('track[sharing]'), 'private');
  assert.ok(request.options.body.get('track[asset_data]') instanceof Blob);
  assert.ok(request.options.body.get('track[artwork_data]') instanceof Blob);
});
