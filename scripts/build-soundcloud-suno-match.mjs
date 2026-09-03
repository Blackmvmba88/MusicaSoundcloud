import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';

const paths = {
  db: 'storage/database/music.sqlite',
  soundcloudAudit: 'reports/soundcloud-metadata-audit.json',
  suno: '/Users/blackmamba/Documents/Codex/2026-08-29/va/work/Reproductor/suno-library-enriched.json',
  oldAudit: '/Users/blackmamba/Documents/Codex/2026-08-29/va/work/Reproductor/soundcloud-local-audit.json',
  recovery: '/Users/blackmamba/Documents/Codex/2026-08-29/va/work/Reproductor/suno-recovery-queue.json',
  usbLibrary: '/Volumes/ADATA SC740/MÚSICA/BLACKMAMBA_LIBRARY/library.json',
  output: 'reports/soundcloud-suno-match-catalog.json',
};

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const scAudit = read(paths.soundcloudAudit);
const sunoTracks = read(paths.suno).tracks || [];
const oldRecords = read(paths.oldAudit).records || [];
const recoveryRecords = read(paths.recovery).records || [];
const usbTracks = read(paths.usbLibrary).tracks || [];
const db = new DatabaseSync(paths.db, { readOnly: true });
const dbTracks = new Map(db.prepare('SELECT soundcloud_id, duration_seconds, soundcloud_snapshot FROM tracks WHERE soundcloud_id IS NOT NULL').all().map((row) => [String(row.soundcloud_id), row]));
db.close();

function plain(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ').replace(/[*_#“”"'`´🎹🎵🎶]+/g, ' ')
    .replace(/\b(blackmamba|official audio|original mix|version|cover)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  if (!a.length) return b.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

function titleSimilarity(a, b) {
  const left = plain(a); const right = plain(b);
  if (!left || !right) return 0;
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

function durationSeconds(value) {
  if (typeof value === 'number') return value;
  const match = String(value || '').match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function soundcloudId(track) {
  return String(track.id || track.urn || '').replace('soundcloud:tracks:', '');
}

const sunoById = new Map(sunoTracks.map((track) => [String(track.id), track]));
const oldBySc = new Map(oldRecords.map((record) => [String(record.soundcloudId), record]));
const recoveryBySc = new Map(recoveryRecords.map((record) => [String(record.soundcloudId), record]));
const usbBySc = new Map(usbTracks.filter((track) => track.soundcloudId || track.soundcloudUrn).map((track) => [String(track.soundcloudId || track.soundcloudUrn).replace('soundcloud:tracks:', ''), track]));

function candidateFrom(track, scDuration, method) {
  if (!track) return null;
  const duration = durationSeconds(track.durationSeconds ?? track.duration);
  const delta = duration != null && scDuration != null ? Math.abs(duration - scDuration) : null;
  return { ...track, durationSeconds: duration, durationDeltaSeconds: delta, method };
}

function algorithmCandidates(scTitle, scDuration) {
  return sunoTracks.map((track) => {
    const similarity = titleSimilarity(scTitle, track.title);
    const duration = durationSeconds(track.durationSeconds ?? track.duration);
    const delta = duration != null && scDuration != null ? Math.abs(duration - scDuration) : null;
    const durationScore = delta == null ? 0 : delta <= 1 ? 0.32 : delta <= 3 ? 0.27 : delta <= 8 ? 0.18 : delta <= 15 ? 0.08 : 0;
    const score = similarity * 0.68 + durationScore;
    return { ...track, durationSeconds: duration, durationDeltaSeconds: delta, titleSimilarity: similarity, score, method: 'nombre + duracion' };
  }).filter((track) => track.titleSimilarity >= 0.42 || (track.durationDeltaSeconds ?? 999) <= 1)
    .sort((a, b) => b.score - a.score).slice(0, 2);
}

const rows = scAudit.tracks.map((sc) => {
  const id = soundcloudId(sc);
  const dbRow = dbTracks.get(sc.urn || id) || dbTracks.get(id);
  let snapshot = {};
  try { snapshot = JSON.parse(dbRow?.soundcloud_snapshot || '{}'); } catch {}
  const scDuration = dbRow?.duration_seconds ?? (snapshot.duration ? snapshot.duration / 1000 : null);
  const recovery = recoveryBySc.get(id);
  const old = oldBySc.get(id);
  let candidates = [];
  let evidence = [];

  if (recovery?.selectedSuno) {
    const richer = sunoById.get(String(recovery.selectedSuno.id));
    candidates = [candidateFrom({ ...recovery.selectedSuno, ...richer }, scDuration, 'cotejo previo fuerte')];
    evidence = recovery.evidence || [];
  } else if (old?.sunoCandidates?.length) {
    candidates = old.sunoCandidates.slice(0, 2).map((item) => candidateFrom({ ...item, ...sunoById.get(String(item.id)) }, scDuration, 'cotejo previo'));
    evidence = old.evidence || [];
  } else {
    candidates = algorithmCandidates(sc.title, scDuration);
  }

  candidates = candidates.filter(Boolean).map((candidate) => ({
    ...candidate,
    titleSimilarity: candidate.titleSimilarity ?? titleSimilarity(sc.title, candidate.title),
  }));
  const best = candidates[0] || null;
  const titleScore = best?.titleSimilarity ?? 0;
  const delta = best?.durationDeltaSeconds;
  const score = recovery ? recovery.confidence : old?.confidence ?? best?.score ?? 0;
  const sameDurationWarning = delta != null && delta <= 1 && titleScore < 0.75;
  const confidence = !best ? 'Sin candidato' : recovery && score >= 0.9 ? 'Alta: cotejo previo' : score >= 0.88 && titleScore >= 0.72 ? 'Alta' : score >= 0.68 ? 'Media' : 'Baja';
  const usb = usbBySc.get(id);
  return {
    soundcloud: {
      id,
      urn: sc.urn,
      title: sc.title,
      durationSeconds: scDuration,
      url: sc.url,
      waveformUrl: snapshot.waveform_url || null,
      artworkUrl: sc.current?.artworkUrl || null,
      genre: sc.current?.genre || null,
      missing: sc.missing || [],
    },
    suno: best ? {
      id: best.id,
      title: best.title,
      durationSeconds: best.durationSeconds,
      url: best.url,
      page: best.page || best.source_pages?.[0] || null,
      audioUrl: best.audioUrl || best.previewAudioUrl || null,
      artworkUrl: best.artworkLarge || best.artwork || null,
      style: best.style || null,
      lyricsStatus: best.lyricsStatus || recovery?.lyricsStatus || null,
    } : null,
    secondCandidate: candidates[1] ? { id: candidates[1].id, title: candidates[1].title, durationSeconds: candidates[1].durationSeconds, url: candidates[1].url } : null,
    match: {
      method: best?.method || 'sin candidato',
      titleSimilarity: titleScore,
      durationDeltaSeconds: delta ?? null,
      waveformSimilarity: null,
      waveformStatus: best ? 'Pendiente: comparar huella/onda' : 'Sin candidato Suno',
      confidence,
      score,
      warning: sameDurationWarning ? 'Misma duracion no confirma el audio; revisar onda obligatoriamente.' : '',
      decision: 'Revisar',
      evidence,
    },
    local: usb ? { id: usb.id, folder: usb.folder, audio: usb.audio, cover: usb.cover, lyrics: usb.lyrics, sha256: usb.sha256 } : null,
  };
});

const summary = {
  soundcloudTracks: rows.length,
  withCandidate: rows.filter((row) => row.suno).length,
  highConfidence: rows.filter((row) => row.match.confidence.startsWith('Alta')).length,
  mediumConfidence: rows.filter((row) => row.match.confidence === 'Media').length,
  lowConfidence: rows.filter((row) => row.match.confidence === 'Baja').length,
  withoutCandidate: rows.filter((row) => !row.suno).length,
  waveformPending: rows.filter((row) => row.suno).length,
  linkedToUsb: rows.filter((row) => row.local).length,
};
writeFileSync(paths.output, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, sources: paths, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(paths.output);
