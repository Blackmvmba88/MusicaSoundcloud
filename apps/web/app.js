const tracksEl = document.querySelector('#tracks');
const statusEl = document.querySelector('#status');
const audio = document.querySelector('#audio');
const nowTitle = document.querySelector('#now-title');
const nowArtist = document.querySelector('#now-artist');

async function loadTracks() {
  const tracks = await fetch('/api/tracks').then((response) => response.json());
  statusEl.textContent = `${tracks.length} pista${tracks.length === 1 ? '' : 's'}`;
  tracksEl.replaceChildren();
  if (!tracks.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Agrega audio a storage/media y escanea la biblioteca.';
    tracksEl.append(empty);
  }
  for (const track of tracks) {
    const button = document.createElement('button');
    button.className = 'track';
    button.innerHTML = `<span class="play">▶</span><span><strong></strong><small></small></span><em></em>`;
    button.querySelector('strong').textContent = track.title;
    button.querySelector('small').textContent = track.artist;
    button.querySelector('em').textContent = track.sync_status;
    button.addEventListener('click', () => {
      audio.src = `/media/${encodeURIComponent(track.local_path.split('/').at(-1))}`;
      nowTitle.textContent = track.title;
      nowArtist.textContent = track.artist;
      audio.play();
    });
    tracksEl.append(button);
  }
}

document.querySelector('#scan').addEventListener('click', async () => {
  statusEl.textContent = 'Escaneando…';
  await fetch('/api/library/scan', { method: 'POST' });
  await loadTracks();
});

loadTracks().catch((error) => { statusEl.textContent = error.message; });

