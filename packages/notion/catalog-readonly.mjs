/**
 * Read-only Notion catalog adapter for the BlackMamba desktop/backend process.
 * Never import this module into the React renderer.
 * API: https://api.notion.com/v1/data_sources/{id}/query
 */
const DEFAULT_SOURCE = '64dfaf42-e95e-44c6-bf85-83783bc43a80';
const API_ROOT = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';

export function sunoIdFromUrl(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw);
    if (!['suno.com', 'www.suno.com'].includes(url.hostname)) return null;
    const match = /^\/song\/([a-f0-9-]{36})\/?$/i.exec(url.pathname);
    return match?.[1]?.toLowerCase() ?? null;
  } catch { return null; }
}

function plain(property) {
  return (property?.title ?? property?.rich_text ?? []).map(item => item.plain_text ?? item.text?.content ?? '').join('');
}
function flag(property) { return property?.type === 'checkbox' ? property.checkbox === true : false; }
function selected(property) { return property?.select?.name ?? null; }
function link(property) { return property?.url || null; }

export function normalizeNotionSong(page) {
  if (!page || typeof page.id !== 'string' || !page.properties) throw new TypeError('Invalid Notion page');
  const p = page.properties;
  const sunoUrl = link(p['Suno URL']);
  return Object.freeze({
    notionPageId: page.id,
    notionUrl: page.url ?? null,
    lastEditedTime: page.last_edited_time ?? null,
    catalogId: p['Catalog ID']?.unique_id?.number ?? null,
    title: plain(p.Song),
    artist: plain(p.Artist),
    sunoUrl,
    sunoId: sunoIdFromUrl(sunoUrl),
    soundcloudUrl: link(p['SoundCloud URL']),
    isrc: plain(p.ISRC).trim() || null,
    lifecycle: selected(p.Lifecycle),
    automationState: selected(p['Automation State']),
    audioMaster: flag(p['Audio Master']),
    artworkSquare: flag(p['Artwork 1:1']),
    lyrics: flag(p.Lyrics),
    metadata: flag(p.Metadata),
    nextAction: plain(p['Next Action']),
    notes: plain(p['Notes / Missing']),
  });
}

/** Stable, strong identifiers only. Titles are never used as identity. */
export function matchNotionSong(local, notionSongs) {
  const localSuno = local.sunoId ?? sunoIdFromUrl(local.sunoUrl);
  const isrc = String(local.isrc ?? '').trim().toUpperCase();
  const sc = local.soundcloudUrl ?? null;
  const candidates = notionSongs.filter(song =>
    (localSuno && song.sunoId === String(localSuno).toLowerCase()) ||
    (isrc && song.isrc?.toUpperCase() === isrc) ||
    (sc && song.soundcloudUrl === sc)
  );
  if (candidates.length === 1) return { status: 'matched', song: candidates[0] };
  return { status: candidates.length ? 'ambiguous' : 'unmatched', song: null };
}

/**
 * Fetch catalog records; no mutation methods are exposed.
 * Call from Electron main or a backend service only.
 */
export async function readNotionCatalog({
  token = process.env.NOTION_TOKEN,
  dataSourceId = process.env.NOTION_CATALOG_DATA_SOURCE_ID ?? DEFAULT_SOURCE,
  fetchImpl = globalThis.fetch,
  limit = 100,
  maxPages = 20,
} = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('NOTION_TOKEN missing');
  if (!/^[a-f0-9-]{32,36}$/i.test(dataSourceId)) throw new Error('Invalid Notion data source ID');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be 1..100');
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new RangeError('maxPages must be >=1');
  const records = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const request = { page_size: limit };
    if (cursor) request.start_cursor = cursor;
    const res = await fetchImpl(`${API_ROOT}/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Notion catalog read failed (HTTP ${res.status})`);
    const payload = await res.json();
    if (!Array.isArray(payload.results)) throw new Error('Invalid Notion response');
    records.push(...payload.results.map(normalizeNotionSong));
    if (!payload.has_more) return records;
    if (!payload.next_cursor || payload.next_cursor === cursor) throw new Error('Invalid Notion pagination cursor');
    cursor = payload.next_cursor;
  }
  throw new Error('Notion pagination safety limit reached; partial results discarded');
}
