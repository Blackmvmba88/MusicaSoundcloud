const tracksEl = document.querySelector('#tracks');
const statusEl = document.querySelector('#status');
const audio = document.querySelector('#audio');
const nowTitle = document.querySelector('#now-title');
const nowArtist = document.querySelector('#now-artist');
const searchEl = document.querySelector('#search');
const labelEl = document.querySelector('#section-label');

let searchTimer;

function sourceLabel(track) {
  if (track.source) return track.source;
  if (track.suno_url || track.suno_id) return 'suno';
  if (track.soundcloud_url || track.soundcloud_id) return 'soundcloud';
  return track.local_path ? 'local' : track.sync_status;
}

function renderTracks(tracks, { search = false } = {}) {
  statusEl.textContent = search
    ? `${tracks.length} coincidencia${tracks.length === 1 ? '' : 's'}`
    : `${tracks.length} pista${tracks.length === 1 ? '' : 's'}`;
  tracksEl.replaceChildren();

  if (!tracks.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = search
      ? 'No hubo coincidencias. Prueba con menos letras, otra palabra o un fragmento.'
      : 'Agrega audio a storage/media y escanea la biblioteca.';
    tracksEl.append(empty);
    return;
  }

  for (const track of tracks) {
    const button = document.createElement('button');
    button.className = 'track';
    button.innerHTML = `
      <span class="play">▶</span>
      <span class="track-copy">
        <strong></strong>
        <small></small>
        <span class="match"></span>
      </span>
      <em></em>`;

    button.querySelector('strong').textContent = track.title;
    button.querySelector('small').textContent =
      [track.artist, track.album, sourceLabel(track)].filter(Boolean).join(' · ');

    const match = button.querySelector('.match');
    if (search && Number.isFinite(track.match_score)) {
      const reason = track.match_field ? ` · ${track.match_field}` : '';
      match.textContent = `${track.match_score}% parecido${reason}`;
    } else {
      match.remove();
    }

    button.querySelector('em').textContent = track.sync_status || '';

    button.addEventListener('click', () => {
      if (!track.local_path) return;
      audio.src = `/media/${encodeURIComponent(track.local_path.split('/').at(-1))}`;
      nowTitle.textContent = track.title;
      nowArtist.textContent = track.artist;
      audio.play();
    });

    tracksEl.append(button);
  }
}

async function loadTracks() {
  const tracks = await fetch('/api/tracks').then((response) => response.json());
  labelEl.textContent = 'Biblioteca';
  renderTracks(tracks);
}

async function searchTracks(query) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=50`);
  const body = await response.json();
  labelEl.textContent = `Resultados para “${query}”`;
  renderTracks(body.results, { search: true });
}

searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchEl.value.trim();

  searchTimer = setTimeout(() => {
    if (!query) loadTracks().catch((error) => { statusEl.textContent = error.message; });
    else searchTracks(query).catch((error) => { statusEl.textContent = error.message; });
  }, 140);
});

document.querySelector('#scan').addEventListener('click', async () => {
  statusEl.textContent = 'Escaneando…';
  await fetch('/api/library/scan', { method: 'POST' });
  const query = searchEl.value.trim();
  if (query) await searchTracks(query);
  else await loadTracks();
});

loadTracks().catch((error) => { statusEl.textContent = error.message; });
