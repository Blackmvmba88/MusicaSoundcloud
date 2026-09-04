import { useEffect, useMemo, useRef, useState } from "react";
import "./probable-matches.css";

type Match = {
  confidence: number;
  suno: { id: string; title: string; duration: string; url: string };
  local: { id: string; title: string; durationSeconds: number; format: string };
  evidence: { durationDeltaSeconds: number; titleSimilarity: number };
};

const clock = (value = 0) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

export function ProbableMatches() {
  const [items, setItems] = useState<Match[]>([]);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => { fetch("/api/suno-local-matches?status=probable").then((response) => response.json()).then((body) => setItems(body.matches || [])); }, []);
  const visible = useMemo(() => items.filter((item) => `${item.suno.title} ${item.local.title}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const current = visible[active] || visible[0];
  useEffect(() => { if (active >= visible.length) setActive(0); }, [active, visible.length]);
  const select = (index: number) => { setActive(index); requestAnimationFrame(() => { audio.current?.play(); }); };
  return <main className="probable-page">
    <header><a href="/music">← Biblioteca</a><div><small>COTEJO SUNO ↔ LOCAL</small><h1>Parejas probables</h1></div><b>{visible.length}</b></header>
    <section className="probable-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en probables…"/><span>Ordenadas por número · escucha antes de confirmar</span></section>
    <section className="probable-list" aria-label="Parejas probables">
      {visible.map((item, index) => <button key={`${item.suno.id}-${item.local.id}`} className={current?.suno.id === item.suno.id ? "active" : ""} onClick={() => select(index)}>
        <strong>{String(index + 1).padStart(3, "0")}</strong>
        <span><small>SUNO</small><b>{item.suno.title}</b><i>{item.suno.duration}</i></span>
        <em>↔</em>
        <span><small>LOCAL · {item.local.format.toUpperCase()}</small><b>{item.local.title}</b><i>{clock(item.local.durationSeconds)}</i></span>
        <mark>Δ {item.evidence.durationDeltaSeconds.toFixed(2)}s</mark>
      </button>)}
    </section>
    {current && <footer className="probable-player">
      <audio ref={audio} src={`/api/media/${current.local.id}`} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setActive((value) => Math.min(value + 1, visible.length - 1))}/>
      <strong>#{String(active + 1).padStart(3, "0")}</strong>
      <button onClick={() => setActive((value) => Math.max(0, value - 1))}>⏮</button>
      <button className="main-control" onClick={() => playing ? audio.current?.pause() : audio.current?.play()}>{playing ? "Ⅱ" : "▶"}</button>
      <button onClick={() => setActive((value) => Math.min(visible.length - 1, value + 1))}>⏭</button>
      <div><b>{current.local.title}</b><small>Suno: {current.suno.title} · diferencia {current.evidence.durationDeltaSeconds.toFixed(2)} s</small></div>
      <a href={current.suno.url} target="_blank" rel="noreferrer">Abrir Suno ↗</a>
    </footer>}
  </main>;
}
