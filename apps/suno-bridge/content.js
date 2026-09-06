const seen = new Set();
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

function discover({ baseline = false } = {}) {
  for (const anchor of document.querySelectorAll('a[href*="/song/"]')) {
    const track = songFromAnchor(anchor);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    if (!baselineReady || baseline) continue;
    pending.set(track.id, track);
  }
  if (pending.size) scheduleFlush(150);
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

// Todo lo que ya estaba visible al cargar la página se toma como baseline de esta sesión.
discover({ baseline: true });
baselineReady = true;

const observer = new MutationObserver(() => discover());
observer.observe(document.documentElement, { childList: true, subtree: true });

// Respaldo barato para interfaces virtualizadas/SPA donde una tarjeta pueda cambiar sin insertar un nodo nuevo.
setInterval(() => discover(), 3000);
