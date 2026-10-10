import test from 'node:test';
import assert from 'node:assert/strict';
import { sunoIdFromUrl, normalizeNotionSong, matchNotionSong, readNotionCatalog } from './catalog-readonly.mjs';

const text = value => ({ type: 'rich_text', rich_text: [{ plain_text: value }] });
const sample = (id, title, sunoUrl) => ({
  id, url: 'https://notion.so/' + id, last_edited_time: '2026-10-09T00:00:00Z',
  properties: {
    Song: { type: 'title', title: [{ plain_text: title }] },
    Artist: text('Iyari Gomez'), ISRC: text(''),
    'Suno URL': { type: 'url', url: sunoUrl },
    'Audio Master': { type: 'checkbox', checkbox: false },
    'Artwork 1:1': { type: 'checkbox', checkbox: false },
    Lyrics: { type: 'checkbox', checkbox: false },
    Metadata: { type: 'checkbox', checkbox: true },
    Lifecycle: { type: 'select', select: { name: 'Curating' } },
  },
});

test('Suno IDs are extracted only from trusted Suno domain', () => {
  const id = 'b68bd223-5bcb-413b-8fb1-002d11d38ecf';
  assert.equal(sunoIdFromUrl('https://suno.com/song/' + id), id);
  assert.equal(sunoIdFromUrl('https://suno.com.evil.com/song/' + id), null);
  assert.equal(sunoIdFromUrl('not-a-url'), null);
});
test('normalize song preserves evidence and incomplete gates', () => {
  const song = normalizeNotionSong(sample('id1', 'Concierto', 'https://suno.com/song/b68bd223-5bcb-413b-8fb1-002d11d38ecf'));
  assert.equal(song.lifecycle, 'Curating');
  assert.equal(song.metadata, true);
  assert.equal(song.artworkSquare, false);
});
test('matching never falls back to title', () => {
  const song = normalizeNotionSong(sample('id1', 'Shadows', null));
  assert.equal(matchNotionSong({ title: 'Shadows' }, [song]).status, 'unmatched');
});
test('ambiguous identity is blocked', () => {
  const url = 'https://suno.com/song/b68bd223-5bcb-413b-8fb1-002d11d38ecf';
  const songs = [sample('a','One',url), sample('b','Two',url)].map(normalizeNotionSong);
  assert.equal(matchNotionSong({ sunoUrl: url }, songs).status, 'ambiguous');
});
test('read is paginated and uses read-only Notion query endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => calls.length === 1
      ? { results: [sample('a','A',null)], has_more: true, next_cursor: 'next' }
      : { results: [sample('b','B',null)], has_more: false } };
  };
  const rows = await readNotionCatalog({ token: 'test-secret', fetchImpl });
  assert.equal(rows.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.init.method === 'POST' && c.url.includes('/data_sources/')));
  assert.equal(JSON.parse(calls[1].init.body).start_cursor, 'next');
});
test('missing credential fails before network', async () => {
  await assert.rejects(readNotionCatalog({ token: '' }), /NOTION_TOKEN missing/);
});
