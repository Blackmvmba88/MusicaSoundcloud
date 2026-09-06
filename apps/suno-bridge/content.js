const known = new Map();
const liveIds = new Set();
const pending = new Map();
let baselineReady = false;
let flushTimer = null;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function songFromAnchor(anchor) {
  const href = anchor?.href || '';
  const match = href.match(/^https?:\/\/(?:www\.)?suno\.com\/song\/([a-zA-Z0-9_-]{6,128})(?:[/?#]|$)/);
  if (!match) return null;
  const id = match[1];
  const title = normalizeText(anchor.getAttribute('aria-label') || anchor.getAttribute('title') || anchor.textContent);
  return {
    id,
    title,
    url: `https://suno.com/song/${id}`,
    observedAt: new Date().toISOString(),
    source: 'suno-web',
    page: location.pathname,
  };
}

function accept(anchor, { baseline = false } = {}) {
  const track = songFromAnchor(anchor);
  if (!track) return;
  const previousTitle = known.get(track.id);

  if (previousTitle === undefined) {
    known.set(track.id, track.title);
    if (!baselineReady || baseline) return;
    liveIds.add(track.id);
    pending.set(track.id, track);
    scheduleFlush(120);
    return;
  }

  // Solo refresca metadata de IDs que nacieron durante esta sesión; no reenvía el baseline.
  if (liveIds.has(track.id) && track.title && track.title !== previousTitle) {
    known.set(track.id, track.title);
    pending.set(track.id, track);
    scheduleFlush(250);
  }
}

function scanNode(node, options = {}) {
  if (!(node instanceof Element)) return;
  if (node.matches?.('a[href*="/song/"]')) accept(node, options);
  for (const anchor of node.querySelectorAll?.('a[href*="/song/"]') || []) accept(anchor, options);
}

function fullScan(options = {}) {
  for (const anchor of document.querySelectorAll('a[href*="/song/"]')) accept(anchor, options);
}

function scheduleFlush(delay = 1000) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, delay);
}

function flush() {
  if (!pending.size) return;
  const tracks = [...pending.values()].slice(0, 50);
  chrome.runtime.sendMessage({ type: 'MAMBA_SUNO_TRACKS', tracks }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      scheduleFlush(5000);
      return;
    }
    for (const track of tracks) pending.delete(track.id);
    if (pending.size) scheduleFlush(250);
  });
}

// Lo visible al cargar se toma como baseline; solo lo que aparezca después cuenta como nuevo.
fullScan({ baseline: true });
baselineReady = true;

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes') {
      scanNode(mutation.target);
      continue;
    }
    for (const node of mutation.addedNodes) scanNode(node);
  }
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['href'],
});

// Respaldo poco frecuente para SPAs/virtualización: 5x menos scans globales que antes.
setInterval(() => fullScan(), 15_000);
