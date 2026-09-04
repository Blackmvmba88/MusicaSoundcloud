import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const auditPath = resolve(root, "soundcloud-local-audit.json");
const sunoPath = resolve(root, "suno-library.json");
const outputPath = resolve(root, "suno-recovery-queue.json");
const concurrency = Math.max(1, Number(process.env.SUNO_CONCURRENCY) || 4);

const audit = JSON.parse(await readFile(auditPath, "utf8"));
const suno = JSON.parse(await readFile(sunoPath, "utf8"));

const durationSeconds = (value) => {
  if (typeof value === "number") return value;
  const parts = String(value || "").split(":").map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

const decodeString = (html, key) => {
  const patterns = [
    new RegExp(`\\\\"${key}\\\\":\\\\"((?:\\\\\\\\.|[^\\\\"])*)\\\\"`, "g"),
    new RegExp(`"${key}":"((?:\\\\.|[^"])*)"`, "g"),
  ];
  const values = patterns.flatMap((pattern) =>
    [...html.matchAll(pattern)].map((match) => {
      try {
        return JSON.parse(`"${match[1]}"`);
      } catch {
        return match[1].replaceAll("\\\\n", "\n").replaceAll('\\\\"', '"');
      }
    }),
  );
  return values.find((value) => !/^\$\d+$/.test(value)) ?? null;
};

const decodeBoolean = (html, key) => {
  const match = new RegExp(`(?:\\\\"|")${key}(?:\\\\"|"):(true|false)`).exec(html);
  return match ? match[1] === "true" : null;
};

const tracksById = new Map((suno.tracks || []).map((track) => [track.id, track]));
const selectCandidate = (record) =>
  (record.sunoCandidates || [])
    .map((candidate) => {
      const track = tracksById.get(candidate.id) || candidate;
      const seconds = durationSeconds(track.duration);
      return {
        ...track,
        durationSeconds: seconds,
        durationDeltaSeconds: Math.abs(record.durationSeconds - seconds),
      };
    })
    .sort(
      (left, right) =>
        left.durationDeltaSeconds - right.durationDeltaSeconds ||
        Number(left.page || Infinity) - Number(right.page || Infinity),
    )[0];

const pending = (audit.records || [])
  .filter((record) => record.preferredSource === "suno")
  .map((record) => ({ record, candidate: selectCandidate(record) }))
  .filter(({ candidate }) => candidate?.url);

const fetchDetails = async ({ record, candidate }) => {
  const warnings = [];
  let html = "";
  try {
    const response = await fetch(candidate.url, {
      headers: { "user-agent": "BlackMamba-Library-Audit/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch (error) {
    warnings.push(`No se pudo consultar Suno: ${error.message}`);
  }

  const prompt = decodeString(html, "prompt")?.trim() || null;
  const hasVocal = decodeBoolean(html, "has_vocal");
  const artwork =
    decodeString(html, "image_large_url") ||
    decodeString(html, "image_url") ||
    candidate.artwork ||
    null;
  const previewAudioUrl = decodeString(html, "audio_url");
  const style = decodeString(html, "tags");
  const instrumentalPrompt = /^\[?instrumental\]?$/i.test(prompt || "");
  const lyrics = instrumentalPrompt ? null : prompt;
  const lyricsStatus = lyrics
    ? "available"
    : hasVocal === false || instrumentalPrompt
      ? "instrumental"
      : "not_exposed";
  const closeDuration = candidate.durationDeltaSeconds <= 5;

  if (!closeDuration) {
    warnings.push(`La duración difiere ${candidate.durationDeltaSeconds}s; revisar versión antes de descargar`);
  }
  if (lyricsStatus === "not_exposed") {
    warnings.push("La página pública no expone letra para este candidato");
  }

  return {
    soundcloudId: record.soundcloudId,
    title: record.title,
    soundcloudUrl: record.soundcloudUrl,
    soundcloudDurationSeconds: record.durationSeconds,
    selectedSuno: {
      id: candidate.id,
      title: candidate.title,
      url: candidate.url,
      version: candidate.version || null,
      durationSeconds: candidate.durationSeconds,
      durationDeltaSeconds: candidate.durationDeltaSeconds,
      previewAudioUrl,
      artwork,
      style,
      hasVocal,
    },
    lyrics,
    lyricsStatus,
    wavStatus: "requires_authenticated_suno_download",
    preferredAction: closeDuration ? "download_wav_and_assets_from_suno" : "review_suno_version",
    confidence: closeDuration ? (html ? 0.95 : 0.8) : 0.58,
    evidence: [record.soundcloudUrl, candidate.url, artwork].filter(Boolean),
    warnings,
    fallbackReason: html ? null : "Conservar el candidato del catálogo y reintentar la consulta pública",
  };
};

const results = new Array(pending.length);
let cursor = 0;
const worker = async () => {
  while (cursor < pending.length) {
    const index = cursor++;
    results[index] = await fetchDetails(pending[index]);
  }
};
await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));

const summary = results.reduce(
  (totals, item) => {
    totals.total += 1;
    totals[item.lyricsStatus] += 1;
    if (item.selectedSuno.artwork) totals.withArtwork += 1;
    if (item.preferredAction === "review_suno_version") totals.needsVersionReview += 1;
    return totals;
  },
  { total: 0, available: 0, instrumental: 0, not_exposed: 0, withArtwork: 0, needsVersionReview: 0 },
);

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary,
      confidence: 0.9,
      evidence: [auditPath, sunoPath, "Public Suno song metadata"],
      warnings: [
        "El audio público es una previsualización MP3; no se presenta como WAV",
        "El WAV requiere una descarga autenticada desde la cuenta de Suno",
      ],
      fallbackReason: null,
      records: results,
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(summary));
