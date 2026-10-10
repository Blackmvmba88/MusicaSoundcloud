import { useEffect, useMemo, useState } from "react";

type NotionSong = {
  notionPageId: string; notionUrl: string | null; title: string;
  sunoId: string | null; isrc: string | null; soundcloudUrl: string | null;
  lifecycle: string | null; audioMaster: boolean; artworkSquare: boolean;
  lyrics: boolean; metadata: boolean; nextAction: string; notes: string;
};
type LocalIdentity = { sunoId?: string | null; sunoUrl?: string | null; isrc?: string; soundcloudUrl?: string | null } | undefined;
const sunoId = (url?: string | null) => {
  try {
    if (!url) return null;
    const u = new URL(url);
    if (!["suno.com", "www.suno.com"].includes(u.hostname)) return null;
    return /^\/song\/([a-f\d-]{36})\/?$/i.exec(u.pathname)?.[1]?.toLowerCase() ?? null;
  } catch { return null; }
};
function match(track: LocalIdentity, songs: NotionSong[]) {
  if (!track) return [];
  const id = track.sunoId?.toLowerCase() || sunoId(track.sunoUrl);
  const isrc = track.isrc?.trim().toUpperCase();
  return songs.filter(song =>
    Boolean(id && song.sunoId === id) ||
    Boolean(isrc && song.isrc?.toUpperCase() === isrc) ||
    Boolean(track.soundcloudUrl && song.soundcloudUrl === track.soundcloudUrl));
}

/** Read-only status. Review ratings remain in the existing local player storage. */
export function NotionCatalogPanel({ track }: { track: LocalIdentity }) {
  const [songs, setSongs] = useState<NotionSong[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "offline" | "error">("idle");
  const refresh = async () => {
    if (!window.blackMambaDesktop?.readNotionCatalog) { setStatus("offline"); return; }
    setStatus("loading");
    try {
      const result = await window.blackMambaDesktop.readNotionCatalog();
      if (!result.ok) { setStatus(result.error === "notion_not_configured" ? "offline" : "error"); return; }
      setSongs(result.songs);
      setStatus("ready");
    } catch { setStatus("error"); }
  };
  useEffect(() => { void refresh(); }, []);
  const matches = useMemo(() => match(track, songs), [track?.sunoId, track?.sunoUrl, track?.isrc, track?.soundcloudUrl, songs]);
  const song = matches.length === 1 ? matches[0] : null;
  return <section aria-label="Notion catálogo musical" style={{ padding: "10px 18px", borderBottom: "1px solid #ffffff24", fontSize: 13 }}>
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <strong>NOTION · CATÁLOGO</strong>
      <span role="status">{status === "loading" ? "Consultando…" : status === "offline" ? "Sin configurar / no disponible" : status === "error" ? "No se pudo consultar" : status === "ready" ? `${songs.length} fichas consultadas` : "Sin consultar"}</span>
      <button type="button" disabled={status === "loading"} onClick={() => void refresh()}>Actualizar</button>
      <small>Solo lectura · no publica ni cambia estados</small>
    </div>
    {status === "ready" && (
      matches.length > 1 ? <p>Coincidencia ambigua: revisar identificadores antes de asociar.</p> :
      !song ? <p>Sin ficha vinculada por ID Suno, ISRC o URL SoundCloud. No se intenta asociar por título.</p> :
      <div style={{ marginTop: 8 }}>
        <strong>{song.title} — {song.lifecycle || "Sin estado"}</strong>
        <span style={{ marginLeft: 10 }}>{[
          ["Master", song.audioMaster], ["Portada 1:1", song.artworkSquare],
          ["Letra", song.lyrics], ["Metadata", song.metadata]
        ].map(([name, done]) => `${done ? "✓" : "○"} ${name}`).join(" · ")}</span>
        {song.nextAction && <p>Próximo: {song.nextAction}</p>}
        {song.notionUrl && <a href={song.notionUrl} target="_blank" rel="noopener noreferrer">Abrir ficha en Notion ↗</a>}
      </div>
    )}
  </section>;
}
