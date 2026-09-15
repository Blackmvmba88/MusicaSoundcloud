import assert from 'node:assert/strict';
import test from 'node:test';
import { SoundCloudClient } from '../packages/soundcloud/src/client.mjs';

test('myTracks pagina /me/tracks siguiendo next_href', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        collection: [{ id: 1, title: 'A' }],
        next_href: 'https://api.soundcloud.com/me/tracks?cursor=next&linked_partitioning=true',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      collection: [{ id: 2, title: 'B' }],
      next_href: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const client = new SoundCloudClient('token-test', fetchImpl);
  const tracks = await client.myTracks();

  assert.deepEqual(tracks.map((track) => track.id), [1, 2]);
  assert.equal(calls[0].url, 'https://api.soundcloud.com/me/tracks?limit=200&linked_partitioning=true');
  assert.equal(calls[1].url, 'https://api.soundcloud.com/me/tracks?cursor=next&linked_partitioning=true');
  assert.equal(calls[0].options.headers.Authorization, 'OAuth token-test');
});
