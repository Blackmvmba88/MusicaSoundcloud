// Safety decisions shared by the SoundCloud private-upload worker.
// An unknown upload outcome must never turn into another automatic POST.
const FINAL_OR_IN_FLIGHT = new Set(['uploaded', 'uploading', 'uncertain']);

export function validateUploadState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      state.version !== 1 || state.rule !== 'private-only' ||
      !state.files || typeof state.files !== 'object' || Array.isArray(state.files)) {
    throw new Error('Checkpoint de SoundCloud inválido: requiere revisión manual');
  }
  return state;
}

export function existingUpload(files, file, sha256) {
  const matches = Object.entries(files).filter(([path, item]) =>
    item && typeof item === 'object' && FINAL_OR_IN_FLIGHT.has(item.status) &&
    (path === file || (sha256 && item.sha256 === sha256)));
  // An in-flight/uncertain match wins over a previously completed record.
  const atRisk = matches.find(([, item]) => item.status === 'uploading' || item.status === 'uncertain');
  if (atRisk) return { status: 'needs-reconciliation', matchedFile: atRisk[0], soundcloudUrl: atRisk[1].soundcloudUrl || null };
  const complete = matches.find(([, item]) => item.status === 'uploaded');
  if (complete) return { status: 'duplicate', matchedFile: complete[0], soundcloudUrl: complete[1].soundcloudUrl || null };
  return null;
}

export function markUploadPending(details, at = new Date().toISOString()) {
  return { ...details, status: 'uploading', sharing: 'private', uploadAttemptedAt: at };
}

export function markUploadUncertain(pending, error, at = new Date().toISOString()) {
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599
    ? `http-${error.status}` : 'unknown-response';
  // Do not serialize error messages: HTTP responses can carry private data.
  return { ...pending, status: 'uncertain', uploadErrorCode: status, needsReconciliationAt: at };
}
