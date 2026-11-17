/** Summarize a full scan, including failures swallowed for per-WAV isolation. */
export function summarizeWorkerScan({ mediaScan, trackErrors = 0 }) {
  const mediaFailures = Number(mediaScan?.failures || 0);
  const mediaUnavailable = mediaScan?.status === 'media-not-mounted';
  const errors = trackErrors + mediaFailures + Number(mediaUnavailable);
  const reasons = [];
  if (mediaUnavailable) reasons.push('volumen de medios no montado');
  if (mediaFailures) reasons.push(`${mediaFailures} WAV(s) fallaron al descubrirse`);
  if (trackErrors) reasons.push(`${trackErrors} pista(s) fallaron al validarse`);
  return {
    errors, trackErrors, mediaFailures, mediaUnavailable,
    status: errors ? 'partial' : 'ok',
    errorMessage: reasons.join('; ') || null,
  };
}

/** A stale or partial heartbeat must not be advertised as healthy. */
export function checkWorkerHeartbeat(heartbeat, intervalSeconds, now = Date.now()) {
  if (!heartbeat || heartbeat.status !== 'ok') throw new Error(`último ciclo no fue completo (${heartbeat?.status || 'desconocido'})`);
  const age = now - Date.parse(heartbeat.at);
  if (!Number.isFinite(age) || age < 0 || age > intervalSeconds * 3000 + 60000)
    throw new Error('heartbeat vencido');
  return { ok: true, at: heartbeat.at };
}
