import { openAsBlob } from 'node:fs';

const API_BASE = 'https://api.soundcloud.com';

export class SoundCloudClient {
  constructor(accessToken, fetchImpl = fetch) {
    if (!accessToken) throw new Error('Falta SOUNDCLOUD_ACCESS_TOKEN');
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
  }

  async request(path, options = {}) {
    const response = await this.fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json; charset=utf-8',
        Authorization: `OAuth ${this.accessToken}`,
        ...options.headers,
      },
    });
    if (!response.ok) {
      const error = new Error(`SoundCloud HTTP ${response.status}: ${await response.text()}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  me() {
    return this.request('/me');
  }

  async collectTracks(initialPath) {
    const tracks = [];
    let path = initialPath;
    while (path) {
      const page = await this.request(path);
      tracks.push(...(Array.isArray(page) ? page : page.collection || []));
      path = page.next_href ? page.next_href.replace(API_BASE, '') : null;
    }
    return tracks;
  }

  myTracks() {
    return this.collectTracks('/me/tracks?limit=200&linked_partitioning=true');
  }

  userTracks(userRef) {
    return this.collectTracks(`/users/${encodeURIComponent(userRef)}/tracks?limit=200&linked_partitioning=true`);
  }

  track(id) {
    return this.request(`/tracks/${encodeURIComponent(id)}`);
  }

  updateMetadata(id, metadata) {
    return this.request(`/tracks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track: metadata }),
    });
  }

  async uploadTrack(audioPath, metadata = {}) {
    const form = new FormData();
    form.set('track[asset_data]', await openAsBlob(audioPath));
    if (metadata.artworkPath) form.set('track[artwork_data]', await openAsBlob(metadata.artworkPath));
    form.set('track[title]', String(metadata.title || 'Sin título'));
    form.set('track[sharing]', 'private');
    if (metadata.artist) form.set('track[artist]', String(metadata.artist));
    if (metadata.description) form.set('track[description]', String(metadata.description));
    if (metadata.genre) form.set('track[genre]', String(metadata.genre));
    if (metadata.tagList) form.set('track[tag_list]', String(metadata.tagList));
    return this.request('/tracks', { method: 'POST', body: form });
  }
}
