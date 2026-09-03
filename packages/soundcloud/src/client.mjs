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
    if (!response.ok) throw new Error(`SoundCloud HTTP ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }

  me() {
    return this.request('/me');
  }

  async userTracks(userRef) {
    const tracks = [];
    let path = `/users/${encodeURIComponent(userRef)}/tracks?limit=200&linked_partitioning=true`;
    while (path) {
      const page = await this.request(path);
      tracks.push(...(Array.isArray(page) ? page : page.collection || []));
      path = page.next_href ? page.next_href.replace(API_BASE, '') : null;
    }
    return tracks;
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
}
