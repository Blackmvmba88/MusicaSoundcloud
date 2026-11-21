/** Summarize a full scan, including failures swallowed for per-WAV isolation. */
export function summarizeWorkerScan({ mediaScan, trackErrors = 0 }) {
  const mediaUnavailable = mediaScan?.status === 'media-not-mounted';
  const mediaUnknown = !mediaScan || !['scanned', 'empty', 'media-not-mounted'].includes(mediaScan.status);
  const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
  const invalidCounters = !validCount(trackErrors) ||
    (mediaScan?.failures !== undefined && !validCount(mediaScan.failures));
  const mediaFailures = validCount(mediaScan?.failures) ? mediaScan.failures : 0;
  const trackFailures = validCount(trackErrors) ? trackErrors : 0;
  const errors = trackFailures + mediaFailures + Number(mediaUnavailable || mediaUnknown || invalidCounters);
  const reasons = [];
  if (mediaUnavailable) reasons.push('volumen de medios no montado');
  if (mediaUnknown) reasons.push('estado del escaneo de medios desconocido');
  if (invalidCounters) reasons.push('contadores de errores inválidos');
  if (mediaFailures) reasons.push(`${mediaFailures} WAV(s) fallaron al descubrirse`);
  if (trackFailures) reasons.push(`${trackFailures} pista(s) fallaron al validarse`);
  return {
    errors, trackErrors: trackFailures, mediaFailures, mediaUnavailable,
    status: errors ? 'partial' : 'ok',
    errorMessage: reasons.join('; ') || null,
  };
}

/** A stale or partial heartbeat must not be advertised as healthy. */
export function checkWorkerHeartbeat(heartbeat, intervalSeconds, now = Date.now()) {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0)
    throw new Error('intervalo de heartbeat inválido');
  if (!heartbeat || heartbeat.status !== 'ok') throw new Error(`último ciclo no fue completo (${heartbeat?.status || 'desconocido'})`);
  const age = now - Date.parse(heartbeat.at);
  if (!Number.isFinite(age) || age < 0 || age > intervalSeconds * 3000 + 60000)
    throw new Error('heartbeat vencido');
  return { ok: true, at: heartbeat.at };
}

/** A failed track stays reachable on the following scan; never advance past it. */
export function checkpointAfterScan({ startCursor, trackIds, firstFailedIndex = null }) {
  if (!Number.isSafeInteger(startCursor) || startCursor < 0 || !Array.isArray(trackIds)
    || trackIds.some(id => !Number.isSafeInteger(id) || id <= 0)
    || trackIds.some((id, i) => i > 0 && id <= trackIds[i - 1])
    || (trackIds.length && trackIds[0] <= startCursor)
    || (firstFailedIndex !== null && (!Number.isInteger(firstFailedIndex)
      || firstFailedIndex < 0 || firstFailedIndex >= trackIds.length))) {
    throw new Error('checkpoint de escaneo inválido');
  }
  if (!trackIds.length) return 0;
  if (firstFailedIndex === null) return trackIds[trackIds.length - 1];
  return firstFailedIndex === 0 ? startCursor : trackIds[firstFailedIndex - 1];
}

/** Retry the earliest failed WAV on the next scan instead of losing its position. */
export function checkpointAfterMediaScan({ startName, fileNames, firstFailedIndex = null }) {
  if (typeof startName !== 'string' || !Array.isArray(fileNames)
    || fileNames.some(name => typeof name !== 'string' || !name)
    || fileNames.some((name, index) => index > 0 && name <= fileNames[index - 1])
    || (firstFailedIndex !== null && (!Number.isSafeInteger(firstFailedIndex)
      || firstFailedIndex < 0 || firstFailedIndex >= fileNames.length))) {
    throw new Error('checkpoint de medios inválido');
  }
  if (!fileNames.length) return startName;
  if (firstFailedIndex === null) return fileNames.at(-1);
  return firstFailedIndex === 0 ? startName : fileNames[firstFailedIndex - 1];
}

/** Quarantine is logical only: retry when the WAV or sidecar changes. */
export const MEDIA_RETRY_LIMIT = 3;
export function mediaRetryDecision({ attempts = 0, lastFingerprint = null, fingerprint }) {
  if (!Number.isSafeInteger(attempts) || attempts < 0 || typeof fingerprint !== 'string'
    || !fingerprint || (lastFingerprint !== null && typeof lastFingerprint !== 'string')) {
    throw new Error('estado de reintento de medios inválido');
  }
  const changed = lastFingerprint !== fingerprint;
  return {
    attempt: changed || attempts < MEDIA_RETRY_LIMIT,
    nextAttempts: changed ? 1 : attempts + 1,
    quarantined: !changed && attempts >= MEDIA_RETRY_LIMIT,
  };
}
