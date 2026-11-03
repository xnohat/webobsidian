import path from 'node:path';

// Central MIME map + media extension sets, shared by the authenticated file
// route, the public-share raw route and the SSR renderer. Keep the audio/video
// sets in sync with web/src/lib/media.ts (Obsidian parity).
const MIME: Record<string, string> = {
  // images
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  // video
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  // audio
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.3gp': 'audio/3gpp',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
};

export function mimeFor(p: string): string {
  return MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * `Content-Disposition` for a file the browser must save rather than render.
 *
 * Without it the browser names the saved file after the last URL path segment, so
 * anything served through `/api/files/content?path=…` lands as `content` with no
 * extension — found while shipping a `.pptx` deliverable (FR-22). The quoted
 * `filename` is the ASCII-safe fallback, `filename*` carries the real UTF-8 name
 * (RFC 5987) so Vietnamese or accented file names survive the download.
 */
export function attachmentDisposition(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'download';
  const ascii = base.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(base).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export const VIDEO_EXT_RE = /\.(mp4|webm|ogv|mov|mkv)$/i;
export const AUDIO_EXT_RE = /\.(mp3|wav|m4a|3gp|flac|ogg|oga|opus)$/i;
