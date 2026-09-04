#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const localPath = process.env.BLACKMAMBA_LIBRARY_MANIFEST || "/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER/library.json";
const sunoPath = resolve(root, "suno-library.json");
const enrichedPath = resolve(root, "suno-library-enriched.json");
const outputPath = resolve(root, "suno-local-matches.json");
const csvPath = resolve(root, "suno-local-matches.csv");

const normalize = (value = "") => String(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(remaster(?:ed)?|master|mix|version|version|v\d+(?:\.\d+)?|audio|official|original)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();
const seconds = (value) => {
  if (Number.isFinite(Number(value))) return Number(value);
  const parts = String(value || "").split(":").map(Number);
  return parts.length && parts.every(Number.isFinite) ? parts.reduce((sum, part) => sum * 60 + part, 0) : 0;
};
const tokens = (value) => new Set(normalize(value).split(" ").filter((word) => word.length > 1));
const similarity = (left, right) => {
  const a = tokens(left), b = tokens(right);
  if (!a.size || !b.size) return 0;
  const common = [...a].filter((word) => b.has(word)).length;
  return (2 * common) / (a.size + b.size);
};
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const [localManifest, sunoManifest, enrichedManifest] = await Promise.all([
  readFile(localPath, "utf8").then(JSON.parse),
  readFile(sunoPath, "utf8").then(JSON.parse),
  readFile(enrichedPath, "utf8").then(JSON.parse).catch(() => ({ tracks: [] })),
]);
const localTracks = localManifest.tracks || [];
const sunoTracks = sunoManifest.tracks || [];
const enrichedById = new Map((enrichedManifest.tracks || []).map((item) => [item.id, item]));
const localByTitle = new Map();
for (const track of localTracks) {
  const key = normalize(track.title);
  if (key) localByTitle.set(key, [...(localByTitle.get(key) || []), track]);
}

const rows = sunoTracks.map((basic) => {
  const enriched = enrichedById.get(basic.id) || {};
  const suno = { ...basic, ...enriched };
  const sunoSeconds = seconds(suno.durationSeconds || suno.duration);
  const exact = localByTitle.get(normalize(suno.title)) || [];
  const pool = exact.length ? exact : localTracks
    .map((track) => ({ track, titleSimilarity: similarity(suno.title, track.title) }))
    .filter((item) => item.titleSimilarity >= 0.72)
    .sort((a, b) => b.titleSimilarity - a.titleSimilarity)
    .slice(0, 12)
    .map((item) => item.track);
  const candidates = pool.map((track) => {
    const localSeconds = seconds(track.durationSeconds || track.duration);
    const durationDeltaSeconds = sunoSeconds && localSeconds ? Math.abs(sunoSeconds - localSeconds) : null;
    const titleSimilarity = similarity(suno.title, track.title);
    const exactTitle = normalize(suno.title) === normalize(track.title);
    const score = (exactTitle ? 0.72 : titleSimilarity * 0.62) +
      (durationDeltaSeconds === null ? 0 : durationDeltaSeconds <= 1 ? 0.28 : durationDeltaSeconds <= 3 ? 0.22 : durationDeltaSeconds <= 6 ? 0.12 : 0);
    return { track, exactTitle, titleSimilarity, durationDeltaSeconds, score };
  }).sort((a, b) => b.score - a.score || (a.durationDeltaSeconds ?? Infinity) - (b.durationDeltaSeconds ?? Infinity));
  const best = candidates[0];
  const second = candidates[1];
  let status = "unmatched";
  if (best) {
    const durationCompatible = best.durationDeltaSeconds === null || best.durationDeltaSeconds <= 6;
    const evidenceSufficient = durationCompatible && (best.exactTitle || best.score >= 0.78);
    const secondCompatible = second && (second.durationDeltaSeconds === null || second.durationDeltaSeconds <= 6) && (second.exactTitle || second.score >= 0.78);
    const ambiguous = evidenceSufficient && secondCompatible && best.score - second.score < 0.04;
    if (!evidenceSufficient) status = "unmatched";
    else if (ambiguous) status = "ambiguous";
    else if (best.exactTitle && best.durationDeltaSeconds !== null && best.durationDeltaSeconds <= 3) status = "confirmed";
    else status = "probable";
  }
  const match = status === "unmatched" ? null : best;
  return {
    status,
    confidence: status === "confirmed" ? 0.98 : status === "probable" ? Number(Math.min(0.94, best.score).toFixed(3)) : status === "ambiguous" ? 0.55 : 0,
    suno: { id: suno.id, title: suno.title, duration: suno.duration, durationSeconds: sunoSeconds, url: suno.url, page: suno.page, version: suno.version, hasLyrics: Boolean(suno.lyrics) },
    local: match ? { id: match.track.id, title: match.track.title, durationSeconds: seconds(match.track.durationSeconds || match.track.duration), folder: match.track.folder, audio: match.track.audio, format: String(match.track.audio || "").split(".").pop()?.toLowerCase() || null } : null,
    evidence: match ? { exactTitle: match.exactTitle, titleSimilarity: Number(match.titleSimilarity.toFixed(3)), durationDeltaSeconds: match.durationDeltaSeconds === null ? null : Number(match.durationDeltaSeconds.toFixed(3)) } : null,
    alternatives: status === "ambiguous" ? candidates.slice(0, 5).map((item) => ({ localId: item.track.id, title: item.track.title, durationDeltaSeconds: item.durationDeltaSeconds, score: Number(item.score.toFixed(3)) })) : [],
    warnings: status === "ambiguous" ? ["Varias grabaciones locales son igualmente compatibles; requiere escucha"] : status === "unmatched" ? ["No se encontró pareja local con evidencia suficiente"] : [],
    fallbackReason: status === "unmatched" ? "Conservar como pista exclusiva de Suno hasta localizar audio local" : null,
  };
});

const summary = rows.reduce((totals, row) => ({ ...totals, [row.status]: totals[row.status] + 1 }), { confirmed: 0, probable: 0, ambiguous: 0, unmatched: 0 });
const matchedLocalIds = new Set(rows.filter((row) => row.local).map((row) => row.local.id));
const localOnly = localTracks.filter((track) => !matchedLocalIds.has(track.id)).map((track) => ({ id: track.id, title: track.title, durationSeconds: seconds(track.durationSeconds || track.duration), folder: track.folder, audio: track.audio }));
const byLocalTrack = Object.values(rows.filter((row) => row.local).reduce((groups, row) => {
  const id = row.local.id;
  groups[id] ||= { local: row.local, sunoVersions: [] };
  groups[id].sunoVersions.push({ ...row.suno, status: row.status, confidence: row.confidence, evidence: row.evidence });
  return groups;
}, {}));
const report = {
  generatedAt: new Date().toISOString(),
  sources: { local: localPath, suno: sunoPath, enriched: enrichedPath },
  summary: { localTracks: localTracks.length, sunoTracks: sunoTracks.length, ...summary, matchedLocalTracks: matchedLocalIds.size, localOnly: localOnly.length, localWithMultipleSunoVersions: byLocalTrack.filter((group) => group.sunoVersions.length > 1).length },
  confidence: 0.98,
  evidence: ["Título normalizado", "Duración comparada cuando está disponible", "Versiones repetidas de Suno conservadas por ID"],
  warnings: ["Las coincidencias ambiguas no deben integrarse automáticamente"],
  fallbackReason: null,
  matches: rows,
  byLocalTrack,
  localOnly,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const header = ["status", "confidence", "suno_id", "suno_title", "suno_duration", "local_id", "local_title", "local_duration_seconds", "delta_seconds", "local_format", "suno_url"];
const lines = rows.map((row) => [row.status, row.confidence, row.suno.id, row.suno.title, row.suno.duration, row.local?.id, row.local?.title, row.local?.durationSeconds, row.evidence?.durationDeltaSeconds, row.local?.format, row.suno.url].map(csv).join(","));
await writeFile(csvPath, `${header.join(",")}\n${lines.join("\n")}\n`);
console.log(JSON.stringify({ ...report.summary, outputPath, csvPath }, null, 2));
