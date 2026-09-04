import { open, stat } from 'node:fs/promises';

const genericTitle = (value) => /^(sin t[ií]tulo|untitled(?: project)?)$/i.test(String(value || '').trim());

async function header(path, length = 131072) {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

export async function validateWav(path) {
  const info = await stat(path);
  const data = await header(path, 12);
  if (!info.isFile() || info.size <= 44) throw new Error('WAV vacío o incompleto');
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('El archivo no tiene una cabecera WAV válida');
  return { size: info.size };
}

export async function validateSquareArtwork(path) {
  const info = await stat(path);
  const data = await header(path);
  let type = null;
  let width = 0;
  let height = 0;
  if (data.length >= 24 && data.toString('ascii', 1, 4) === 'PNG') {
    type = 'png'; width = data.readUInt32BE(16); height = data.readUInt32BE(20);
  } else if (data[0] === 0xff && data[1] === 0xd8) {
    type = 'jpeg';
    for (let offset = 2; offset + 9 < data.length;) {
      if (data[offset] !== 0xff) { offset += 1; continue; }
      const marker = data[offset + 1];
      const length = data.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = data.readUInt16BE(offset + 5); width = data.readUInt16BE(offset + 7); break;
      }
      offset += Math.max(2, length + 2);
    }
  }
  if (!type || !width || !height) throw new Error('La portada no es un PNG o JPEG válido');
  if (width !== height) throw new Error(`La portada debe ser 1:1; actualmente es ${width}x${height}`);
  return { type, width, height, size: info.size };
}

export function validateMetadata(sidecar, title) {
  const errors = [];
  if (sidecar.metadataStatus !== 'ready') errors.push('metadataStatus no está en ready');
  if (!String(title || '').trim() || genericTitle(title)) errors.push('falta un título definitivo');
  if (sidecar.artist !== 'Iyari Gomez') errors.push('artist debe ser Iyari Gomez');
  if (sidecar.recordLabel !== 'BlackMamba RECORDS') errors.push('recordLabel debe ser BlackMamba RECORDS');
  if (sidecar.instrumental !== true && !String(sidecar.lyrics || '').trim())
    errors.push('falta letra o marcar instrumental=true');
  return errors;
}

export async function validateTrackPackage({ audioPath, artworkPath, sidecar, title }) {
  const metadataErrors = validateMetadata(sidecar, title);
  if (metadataErrors.length) return { ready: false, stage: 'waiting-metadata', errors: metadataErrors };
  if (sidecar.coverStatus !== 'ready' || !artworkPath)
    return { ready: false, stage: 'waiting-cover', errors: ['falta una portada aprobada'] };
  try {
    const [audio, artwork] = await Promise.all([validateWav(audioPath), validateSquareArtwork(artworkPath)]);
    return { ready: true, stage: 'ready-private-upload', errors: [], audio, artwork };
  } catch (error) {
    return { ready: false, stage: 'invalid-package', errors: [error.message] };
  }
}
