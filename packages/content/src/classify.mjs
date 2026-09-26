import { basename, extname } from 'node:path';

const audio = new Set(['.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.aiff', '.aif']);
const image = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.tif', '.tiff', '.svg']);
const video = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const document = new Set(['.pdf', '.txt', '.md', '.doc', '.docx', '.rtf', '.csv', '.json']);
const archive = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz', '.dmg', '.pkg']);
const partial = new Set(['.crdownload', '.part', '.download', '.tmp']);
const captureName = /(?:screen[ -]?shot|screenshot|captura de pantalla|grabaci[oó]n de pantalla|screen recording)/i;

export function isPartialDownload(path) {
  return partial.has(extname(path).toLowerCase());
}

export function classifyContentPath(path) {
  const ext = extname(path).toLowerCase();
  const name = basename(path);
  if (captureName.test(name)) return video.has(ext) ? 'capture' : image.has(ext) ? 'capture' : 'capture';
  if (audio.has(ext)) return 'audio';
  if (image.has(ext)) return 'image';
  if (video.has(ext)) return 'video';
  if (document.has(ext)) return 'document';
  if (archive.has(ext)) return 'archive';
  return 'other';
}

export function fileExternalId(info, path) {
  if (Number.isFinite(Number(info?.dev)) && Number.isFinite(Number(info?.ino)) && Number(info.ino) !== 0) {
    return `fs:${info.dev}:${info.ino}`;
  }
  return `path:${path}`;
}
