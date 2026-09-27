function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function parsedMs(value) {
  const ms = Date.parse(value || '');
  return Number.isNaN(ms) ? null : ms;
}

export function sortMetricSnapshots(rows = []) {
  return [...rows].sort((a, b) => {
    const left = parsedMs(a.capturedAt ?? a.captured_at) ?? 0;
    const right = parsedMs(b.capturedAt ?? b.captured_at) ?? 0;
    return left - right;
  });
}

export function baselineForWindow(rows, days) {
  const sorted = sortMetricSnapshots(rows);
  if (sorted.length < 2) return null;

  const latest = sorted.at(-1);
  const latestMs = parsedMs(latest.capturedAt ?? latest.captured_at);
  if (latestMs === null) return null;

  const target = latestMs - days * 86_400_000;
  const eligible = sorted.filter((row) => {
    const ms = parsedMs(row.capturedAt ?? row.captured_at);
    return ms !== null && ms <= target;
  });
  return eligible.at(-1) ?? null;
}

export function normalizedWindowDelta(rows, field, days) {
  const sorted = sortMetricSnapshots(rows);
  if (sorted.length < 2) return null;

  const latest = sorted.at(-1);
  const baseline = baselineForWindow(sorted, days);
  if (!baseline) return null;

  const latestValue = finite(latest[field]);
  const baselineValue = finite(baseline[field]);
  const latestMs = parsedMs(latest.capturedAt ?? latest.captured_at);
  const baselineMs = parsedMs(baseline.capturedAt ?? baseline.captured_at);
  if (
    latestValue === null ||
    baselineValue === null ||
    latestMs === null ||
    baselineMs === null ||
    latestMs <= baselineMs
  ) {
    return null;
  }

  const elapsedDays = (latestMs - baselineMs) / 86_400_000;
  const delta = Math.max(0, latestValue - baselineValue);
  return Math.round((delta / elapsedDays) * days);
}

export function summarizeMetricHistory(rows = []) {
  const sorted = sortMetricSnapshots(rows);
  const latest = sorted.at(-1);
  if (!latest) return null;

  return {
    capturedAt: latest.capturedAt ?? latest.captured_at ?? null,
    playbackCount: finite(latest.playbackCount ?? latest.playback_count),
    likesCount: finite(latest.likesCount ?? latest.likes_count),
    commentCount: finite(latest.commentCount ?? latest.comment_count),
    repostsCount: finite(latest.repostsCount ?? latest.reposts_count),
    downloadCount: finite(latest.downloadCount ?? latest.download_count),
    plays7d: normalizedWindowDelta(sorted, 'playback_count', 7),
    plays30d: normalizedWindowDelta(sorted, 'playback_count', 30),
  };
}
