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
