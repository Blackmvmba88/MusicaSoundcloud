import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source =
  process.env.SOUNDCLOUD_INVENTORY ||
  "/Volumes/ADATA SC740/05_BACKUPS_RESCATES/MAC_PRE_FORMAT_2026-03-28/Documents_GitHub/codex/catalog/soundcloud_inventory.json";
const norm = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const local = JSON.parse(
  await readFile(resolve(root, "public/player/library.json"), "utf8"),
);
const soundcloud = JSON.parse(await readFile(source, "utf8"));
const suno = JSON.parse(
  await readFile(resolve(root, "suno-library.json"), "utf8"),
);
const index = (items) =>
  items.reduce((map, track) => {
    const key = norm(track.title);
    map.set(key, [...(map.get(key) || []), track]);
    return map;
  }, new Map());
const localByTitle = index(local.tracks || []);
const sunoByTitle = index(suno.tracks || []);

const records = (soundcloud.records || []).map((soundcloudTrack) => {
  const title = soundcloudTrack.canonical_title || soundcloudTrack.title;
  const match = (localByTitle.get(norm(title)) || [])[0];
  const candidates = sunoByTitle.get(norm(title)) || [];
  const format = match
    ? extname(match.file || "")
        .slice(1)
        .toLowerCase()
        .replace("wave", "wav")
    : null;
  const preferredSource = !match
    ? candidates.length
      ? "suno"
      : "soundcloud"
    : null;
  return {
    soundcloudId: soundcloudTrack.track_id,
    title,
    soundcloudUrl: soundcloudTrack.permalink_url,
    durationSeconds: Number(soundcloudTrack.duration_seconds) || 0,
    localStatus: match?.file ? "available" : "recoverable",
    availabilityStatus: match?.file ? "local" : "recoverable",
    localFormat: format,
    localTrackId: match?.id || null,
    localFile: match?.file || null,
    preferredSource,
    recoveryPriority:
      preferredSource === "suno"
        ? ["suno_wav", "soundcloud"]
        : preferredSource === "soundcloud"
          ? ["soundcloud"]
          : [],
    preferredAction: !match
      ? candidates.length
        ? "download_wav_from_suno"
        : "download_from_soundcloud"
      : format === "mp3"
        ? "consider_wav_upgrade"
        : "none",
    sunoCandidates: candidates.slice(0, 8).map((track) => ({
      id: track.id,
      title: track.title,
      duration: track.duration,
      url: track.url,
      page: track.page,
    })),
    confidence: match ? 0.9 : candidates.length ? 0.75 : 0.6,
    evidence: [
      soundcloudTrack.permalink_url,
      ...(match ? [match.file] : []),
      ...candidates.slice(0, 2).map((track) => track.url),
    ],
    warnings: [
      ...(!match
        ? ["Ficha localizada; audio pendiente de recuperación local"]
        : []),
      ...(format === "mp3" ? ["Sólo existe MP3; revisar si requiere WAV"] : []),
    ],
    fallbackReason: match
      ? null
      : candidates.length
        ? "Validar duración antes de recuperar el WAV desde Suno"
        : "Usar la publicación de SoundCloud como fuente de recuperación",
  };
});

const summary = records.reduce(
  (totals, record) => {
    totals.total += 1;
    totals[record.localStatus] += 1;
    if (record.localFormat === "mp3") totals.mp3 += 1;
    if (record.localFormat === "wav") totals.wav += 1;
    if (record.preferredSource === "suno") totals.sunoPreferred += 1;
    if (record.preferredSource === "soundcloud") totals.soundcloudFallback += 1;
    return totals;
  },
  {
    total: 0,
    available: 0,
    recoverable: 0,
    mp3: 0,
    wav: 0,
    sunoPreferred: 0,
    soundcloudFallback: 0,
  },
);
const output = {
  generatedAt: new Date().toISOString(),
  source,
  summary,
  confidence: 0.82,
  evidence: ["SoundCloud inventory", "Local player catalog", "Suno catalog"],
  warnings: ["Validar título y duración antes de recuperar audio"],
  fallbackReason: null,
  records,
};
await writeFile(
  resolve(root, "public/player/source-audit.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
await writeFile(
  resolve(root, "soundcloud-local-audit.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log(JSON.stringify(summary));
