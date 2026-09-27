function finiteInteger(value) {
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

export function normalizeSoundCloudTrackMetrics(track) {
  return {
    soundcloudId: String(track.urn || track.id),
    title: track.title || null,
    url: track.permalink_url || null,
    createdAt: track.created_at || track.createdAt || null,
    playbackCount: finiteInteger(track.playback_count),
    likesCount: finiteInteger(track.favoritings_count),
    commentCount: finiteInteger(track.comment_count),
    repostsCount: finiteInteger(track.reposts_count),
    downloadCount: finiteInteger(track.download_count),
  };
}

export function summarizeSoundCloudTrackMetrics(tracks, { top = 50 } = {}) {
  const normalized = tracks.map(normalizeSoundCloudTrackMetrics);
  const fields = [
    'playbackCount',
    'likesCount',
    'commentCount',
    'repostsCount',
    'downloadCount',
  ];

  const totals = {};
  const coverage = {};
  for (const field of fields) {
    const known = normalized.filter((track) => track[field] !== null);
    totals[field] = known.reduce((sum, track) => sum + track[field], 0);
    coverage[field] = { known: known.length, total: normalized.length };
  }

  const topTracksByPlays = normalized
    .filter((track) => track.playbackCount !== null)
    .sort((a, b) => b.playbackCount - a.playbackCount)
    .slice(0, top);

  return {
    totals,
    coverage,
    topTracksByPlays,
    tracks: normalized,
  };
}
