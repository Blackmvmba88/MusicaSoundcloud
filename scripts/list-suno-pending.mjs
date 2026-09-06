import { listPendingSunoTracks, openDatabase } from '../packages/database/src/db.mjs';

const db = openDatabase();
try {
  const tracks = listPendingSunoTracks(db);
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    pending: tracks.length,
    tracks: tracks.map((track) => ({
      id: track.suno_id,
      title: track.title,
      artist: track.artist,
      url: track.suno_url,
      observedAt: track.suno_observed_at,
      localPath: track.local_path,
      syncStatus: track.sync_status,
    })),
  }, null, 2));
} finally {
  db.close();
}
