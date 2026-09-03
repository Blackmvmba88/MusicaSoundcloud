import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { loadEnvFile } from 'node:process';

if (!existsSync('.env')) throw new Error('Falta .env');
loadEnvFile('.env');

const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;
const redirectUri = 'http://127.0.0.1:8765/callback';
if (!clientId || !clientSecret) throw new Error('Faltan las credenciales de la aplicacion SoundCloud');

const base64url = (value) => Buffer.from(value).toString('base64url');
const verifier = base64url(crypto.randomBytes(48));
const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
const state = base64url(crypto.randomBytes(24));
const authorizationUrl = new URL('https://secure.soundcloud.com/authorize');
authorizationUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  state,
}).toString();

function saveTokens(tokens) {
  const current = readFileSync('.env', 'utf8').split(/\r?\n/);
  const updates = {
    SOUNDCLOUD_ACCESS_TOKEN: tokens.access_token,
    SOUNDCLOUD_REFRESH_TOKEN: tokens.refresh_token || '',
  };
  const seen = new Set();
  const next = current.map((line) => {
    const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
    if (!key || !(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, value] of Object.entries(updates)) if (!seen.has(key)) next.push(`${key}=${value}`);
  writeFileSync('.env', `${next.filter(Boolean).join('\n')}\n`, { mode: 0o600 });
}

async function exchange(code) {
  const response = await fetch('https://secure.soundcloud.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      code,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`SoundCloud OAuth HTTP ${response.status}`);
  saveTokens(body);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, redirectUri);
  try {
    if (url.pathname !== '/callback') throw new Error('Ruta de retorno incorrecta');
    if (url.searchParams.get('state') !== state) throw new Error('Estado OAuth invalido');
    const code = url.searchParams.get('code');
    if (!code) throw new Error(url.searchParams.get('error_description') || 'SoundCloud no devolvio codigo');
    await exchange(code);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<h1>SoundCloud autorizado</h1><p>Puedes cerrar esta ventana y volver a Codex.</p>');
    console.log('SoundCloud autorizado. Tokens guardados de forma privada en .env.');
    server.close();
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`No se pudo autorizar: ${error.message}`);
    console.error(error.message);
    server.close(() => { process.exitCode = 1; });
  }
});

server.listen(8765, '127.0.0.1', () => {
  console.log('Abriendo la autorizacion de SoundCloud en el navegador…');
  spawn('open', [authorizationUrl.toString()], { detached: true, stdio: 'ignore' }).unref();
});

setTimeout(() => server.close(() => {
  console.error('La autorizacion expiro despues de 10 minutos.');
  process.exitCode = 1;
}), 10 * 60 * 1000).unref();
