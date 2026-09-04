#!/usr/bin/env node
/**
 * merge-soundcloud-catalog.mjs
 *
 * Fusiona el catálogo local (public/player/library.json) con las fichas de
 * SoundCloud (soundcloud-local-audit.json) y escribe el resultado de vuelta
 * a public/player/library.json, listo para que el reproductor web lo consuma.
 *
 * Reglas:
 *  - Si una canción ya existe en el catálogo local (por localTrackId o por
 *    coincidencia de título normalizado), se enriquece con los metadatos de SC
 *    (portada panorámica, sourceUrl, permalink) pero NO se duplica.
 *  - Si la canción solo existe en SoundCloud (recoverable), se añade como
 *    nueva entrada con localStatus="recoverable", streamUrl=null y la URL de SC
 *    como sourceUrl para que el usuario pueda recuperarla.
 *  - El orden final: primero las pistas locales, luego las de SC puras.
 *  - Se genera también public/player/source-audit.json (copia del audit)
 *    para que el servidor Electron también lo tenga.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (secs) => {
  const s = Number(secs) || 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const norm = (v = '') =>
  v.normalize('NFD')
   .replace(/[\u0300-\u036f]/g, '')
   .toLowerCase()
   .replace(/[^a-z0-9]+/g, ' ')
   .trim();

// ── Load sources ────────────────────────────────────────────────────────────
const [libraryRaw, auditRaw] = await Promise.all([
  readFile(resolve(root, 'public/player/library.json'), 'utf8'),
  readFile(resolve(root, 'soundcloud-local-audit.json'), 'utf8'),
]);

const library = JSON.parse(libraryRaw);
const audit   = JSON.parse(auditRaw);

const existingTracks = library.tracks || [];

// Build look-up maps for existing tracks
const byId    = new Map(existingTracks.map(t => [t.id, t]));
const byTitle = new Map();
for (const t of existingTracks) {
  const key = norm(t.title);
  if (!byTitle.has(key)) byTitle.set(key, t);
}

// ── Process SoundCloud records ──────────────────────────────────────────────
const scOnlyTracks = [];
let enriched = 0;
let added    = 0;
let skipped  = 0;

for (const rec of audit.records || []) {
  const title   = rec.title;
  const scId    = rec.soundcloudId;
  const scUrl   = rec.soundcloudUrl;
  const durFmt  = fmt(rec.durationSeconds);

  // --- Case 1: already in local library by localTrackId ---
  if (rec.localTrackId && byId.has(rec.localTrackId)) {
    const existing = byId.get(rec.localTrackId);
    existing.sourceUrl      = existing.sourceUrl      ?? scUrl;
    existing.soundcloudUrl  = scUrl;
    existing.soundcloudId   = scId;
    existing.availabilityStatus = existing.availabilityStatus ?? 'local';
    enriched++;
    continue;
  }

  // --- Case 2: already in local library by normalized title ---
  const key = norm(title);
  if (byTitle.has(key)) {
    const existing = byTitle.get(key);
    existing.sourceUrl      = existing.sourceUrl      ?? scUrl;
    existing.soundcloudUrl  = scUrl;
    existing.soundcloudId   = scId;
    enriched++;
    continue;
  }

  // --- Case 3: available locally but not matched (localFile present) ---
  if (rec.localStatus === 'available' && rec.localFile) {
    // Add as a new track pointing to the local file
    scOnlyTracks.push({
      id:                 `sc-${scId}`,
      title,
      artist:             'Iyari Gomez',
      file:               rec.localFile,
      downloadUrl:        rec.localFile,
      streamUrl:          null,
      sourceUrl:          scUrl,
      soundcloudUrl:      scUrl,
      soundcloudId:       scId,
      duration:           durFmt,
      tag:                'SoundCloud',
      cover:              null,
      panoramicCover:     null,
      lyrics:             '',
      hasLyrics:          false,
      localStatus:        'available',
      localFormat:        rec.localFormat || 'mp3',
      source:             'soundcloud',
      availabilityStatus: 'local',
      preferredSource:    null,
      preferredAction:    'none',
      sunoCandidates:     rec.sunoCandidates || [],
      confidence:         rec.confidence,
      evidence:           rec.evidence,
      warnings:           rec.warnings,
      fallbackReason:     rec.fallbackReason,
    });
    added++;
    continue;
  }

  // --- Case 4: recoverable from SoundCloud or Suno ---
  if (rec.localStatus === 'recoverable') {
    scOnlyTracks.push({
      id:                 `sc-${scId}`,
      title,
      artist:             'Iyari Gomez',
      file:               '',
      downloadUrl:        null,
      streamUrl:          null,
      sourceUrl:          scUrl,
      soundcloudUrl:      scUrl,
      soundcloudId:       scId,
      duration:           durFmt,
      tag:                rec.sunoCandidates?.length
                            ? 'Recuperar · Suno'
                            : 'Recuperar · SoundCloud',
      cover:              null,
      panoramicCover:     null,
      lyrics:             '',
      hasLyrics:          false,
      localStatus:        'recoverable',
      localFormat:        null,
      source:             'soundcloud',
      availabilityStatus: 'recoverable',
      preferredSource:    rec.preferredSource || 'soundcloud',
      preferredAction:    rec.preferredAction || 'download_from_soundcloud',
      sunoCandidates:     rec.sunoCandidates || [],
      confidence:         rec.confidence,
      evidence:           rec.evidence,
      warnings:           rec.warnings,
      fallbackReason:     rec.fallbackReason,
    });
    added++;
    continue;
  }

  skipped++;
}

// ── Build final catalog ─────────────────────────────────────────────────────
// Deduplicate scOnlyTracks by id (safety net)
const seenSc = new Set();
const uniqueSc = scOnlyTracks.filter(t => {
  if (seenSc.has(t.id)) return false;
  seenSc.add(t.id);
  return true;
});

const merged = {
  ...library,
  generatedAt: new Date().toISOString(),
  mergedSoundCloud: true,
  tracks: [...existingTracks, ...uniqueSc],
  summary: {
    ...(library.summary ?? {}),
    total:      existingTracks.length + uniqueSc.length,
    local:      existingTracks.length,
    soundcloud: uniqueSc.length,
    enriched,
  },
};

// ── Write outputs ───────────────────────────────────────────────────────────
await writeFile(
  resolve(root, 'public/player/library.json'),
  `${JSON.stringify(merged, null, 2)}\n`,
);
// Keep source-audit in sync for Electron
await writeFile(
  resolve(root, 'public/player/source-audit.json'),
  `${JSON.stringify(audit, null, 2)}\n`,
);

console.log('✅ Catálogo actualizado:');
console.log(`   Pistas locales:       ${existingTracks.length}`);
console.log(`   SC nuevas añadidas:   ${uniqueSc.length}  (${added} procesadas)`);
console.log(`   Pistas enriquecidas:  ${enriched}`);
console.log(`   Omitidas:             ${skipped}`);
console.log(`   TOTAL en catálogo:    ${merged.tracks.length}`);
console.log(`   → public/player/library.json`);
