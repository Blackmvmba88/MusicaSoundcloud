import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPendingSunoTracks, listTracks, openDatabase, upsertLocalTrack, upsertSunoTrack } from '../../../packages/database/src/db.mjs';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const webRoot = resolve(root, 'apps/web');
const mediaRoot = resolve(root, process.env.MUSIC_LIBRARY_ROOT || 'storage/media');
const db = openDatabase();
const port = Number(process.env.PORT || 4173);
const audioExtensions = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': mime['.json'] });
  response.end(JSON.stringify(body));
}

function scan(directory) {
  const found = [];
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...scan(path));
    else if (audioExtensions.has(extname(entry.name).toLowerCase())) found.push(path);
  }
  return found;
}

function safePath(base, requested) {
  const path = resolve(base, `.${requested}`);
  return path === base || path.startsWith(`${base}${sep}`) ? path : null;
}

function allowSunoBridge(request, response) {
  const origin = request.headers.origin;
  if (origin && !origin.startsWith('chrome-extension://')) return false;
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

async function readJson(request, maxBytes = 64 * 1024) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) throw new Error('Payload demasiado grande');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);

    if (url.pathname.startsWith('/api/suno/')) {
      if (!allowSunoBridge(request, response)) return json(response, 403, { error: 'Origen no permitido' });
      if (request.method === 'OPTIONS') return response.end();
    }

    if (url.pathname === '/api/health') return json(response, 200, { ok: true });
    if (url.pathname === '/api/tracks' && request.method === 'GET') return json(response, 200, listTracks(db));
    if (url.pathname === '/api/suno/pending' && request.method === 'GET') return json(response, 200, { tracks: listPendingSunoTracks(db) });
    if (url.pathname === '/api/suno/events' && request.method === 'POST') {
      const payload = await readJson(request);
      const tracks = Array.isArray(payload.tracks) ? payload.tracks : payload.track ? [payload.track] : [];
      if (!tracks.length || tracks.length > 50) return json(response, 400, { error: 'Se requieren entre 1 y 50 canciones' });
      const recorded = [];
      for (const track of tracks) recorded.push(upsertSunoTrack(db, track));
      return json(response, 200, { recorded: recorded.length, tracks: recorded });
    }
    if (url.pathname === '/api/library/scan' && request.method === 'POST') {
      const tracks = scan(mediaRoot).map((localPath) => upsertLocalTrack(db, {
        title: localPath.split(sep).at(-1).replace(/\.[^.]+$/, '').replaceAll('_', ' '),
        localPath,
      }));
      return json(response, 200, { imported: tracks.length, tracks });
    }
    if (url.pathname.startsWith('/media/')) {
      const path = safePath(mediaRoot, url.pathname.slice('/media'.length));
      if (!path || !existsSync(path) || !statSync(path).isFile()) return json(response, 404, { error: 'Archivo no encontrado' });
      response.writeHead(200, { 'Content-Type': mime[extname(path).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
      return createReadStream(path).pipe(response);
    }
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const path = safePath(webRoot, requested);
    if (!path || !existsSync(path) || !statSync(path).isFile()) return json(response, 404, { error: 'Ruta no encontrada' });
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    createReadStream(path).pipe(response);
  } catch (error) {
    if (!response.headersSent) json(response, 400, { error: error.message || 'Solicitud inválida' });
    else response.end();
  }
});

server.listen(port, '127.0.0.1', () => console.log(`BlackMamba Music Hub: http://127.0.0.1:${port}`));
