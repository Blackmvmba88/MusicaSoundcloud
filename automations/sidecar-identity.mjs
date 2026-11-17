const SUNO_ID = /^[A-Za-z0-9_-]{6,128}$/;

/** Resolve the canonical Suno identifier from an untrusted .suno.json sidecar. */
export function resolveSidecarSunoId(sidecar, { expectedId = null } = {}) {
  if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) {
    throw new Error('La ficha Suno debe ser un objeto JSON');
  }
  const declared = [];
  for (const field of ['id', 'sunoId']) {
    const raw = sidecar[field];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string') throw new Error(`Identificador ${field} no es texto`);
    const value = raw.trim();
    if (!value) continue;
    if (!SUNO_ID.test(value)) throw new Error(`Identificador ${field} inválido`);
    declared.push(value);
  }
  if (new Set(declared).size > 1) {
    throw new Error('La ficha declara identidades Suno contradictorias (id y sunoId)');
  }
  const id = declared[0] || null;
  if (expectedId && id !== expectedId) {
    throw new Error(id
      ? `La ficha Suno declara ${id}, pero la pista canónica es ${expectedId}`
      : `La ficha Suno no declara la identidad canónica ${expectedId}`);
  }
  return id;
}
