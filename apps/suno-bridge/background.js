const endpoint = 'http://127.0.0.1:4173/api/suno/events';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'MAMBA_SUNO_TRACKS' || !Array.isArray(message.tracks) || message.tracks.length === 0) return;

  (async () => {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: message.tracks }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      sendResponse({ ok: true, recorded: body.recorded || 0 });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true;
});
