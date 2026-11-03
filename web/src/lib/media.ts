import {defaultCodeFileViewer,resolveCodeLanguage,type CodeFileViewerSettings} from './codeFiles';
// Obsidian-parity media extension sets, shared across the Live Preview editor,
// the Reading-view renderer (markdown.ts) and the direct file view (Workspace).
// Mirrors the desktop app's image/audio/video extension groups so `![[x.mp4]]`
// and opening a media file behave the same as Obsidian.
export const VIDEO_EXT_RE = /\.(mp4|webm|ogv|mov|mkv)$/i;
export const AUDIO_EXT_RE = /\.(mp3|wav|m4a|3gp|flac|ogg|oga|opus)$/i;
export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i;
export const PDF_EXT_RE = /\.pdf$/i;
/**
 * Types the app has no viewer for but a human still has to get *out* of the vault
 * (FR-22): office documents, archives. They open a pane with a Download button
 * rather than falling through to the markdown editor, which would show binary
 * noise where an empty tab used to be. Anything not listed here keeps the old
 * behaviour and opens as text.
 */
export const DOWNLOAD_EXT_RE = /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf|zip|7z|tar|gz|tgz|bz2|xz)$/i;

/** Explicit WebObsidian registry; downloadable documents are supported too. */
export function isSupportedVaultFile(path: string, settings:CodeFileViewerSettings=defaultCodeFileViewer): boolean {
  return resolveCodeLanguage(path,settings)!==null || /\.(md|markdown|canvas|txt|json|csv|css|js|ya?ml)$/i.test(path)
    || IMAGE_EXT_RE.test(path) || VIDEO_EXT_RE.test(path) || AUDIO_EXT_RE.test(path)
    || PDF_EXT_RE.test(path) || DOWNLOAD_EXT_RE.test(path);
}

export type MediaKind = 'video' | 'audio';

/** Media kind for an embed/file target (ignoring any `#fragment`), else null. */
export function mediaKind(target: string): MediaKind | null {
  const t = target.split('#')[0];
  if (VIDEO_EXT_RE.test(t)) return 'video';
  if (AUDIO_EXT_RE.test(t)) return 'audio';
  return null;
}

/**
 * The pane a vault file opens in (FR-21, FR-22). A file whose extension is none of
 * these and is not markdown — an unusual text format — stays `text` and falls
 * through to the editor. Office documents and archives are `attachment`: no
 * viewer exists, and the editor would render their bytes as garbage.
 */
export type FileViewKind = 'canvas' | 'image' | 'video' | 'audio' | 'pdf' | 'attachment' | 'text';

export function fileViewKind(path: string): FileViewKind {
  const p = path.split('#')[0];
  if (/\.canvas$/i.test(p)) return 'canvas';
  if (IMAGE_EXT_RE.test(p)) return 'image';
  if (VIDEO_EXT_RE.test(p)) return 'video';
  if (AUDIO_EXT_RE.test(p)) return 'audio';
  if (PDF_EXT_RE.test(p)) return 'pdf';
  if (DOWNLOAD_EXT_RE.test(p)) return 'attachment';
  return 'text';
}

/**
 * Human label for the file's type, used by the download pane's copy (FR-22):
 * `status.pptx` → "PowerPoint". Falls back to "This" so the sentence still reads.
 */
const EXT_LABELS: Record<string, string> = {
  doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel', ppt: 'PowerPoint', pptx: 'PowerPoint',
  odt: 'OpenDocument text', ods: 'OpenDocument spreadsheet', odp: 'OpenDocument presentation',
  rtf: 'Rich-text', zip: 'Archive', '7z': 'Archive', tar: 'Archive', gz: 'Archive',
  tgz: 'Archive', bz2: 'Archive', xz: 'Archive',
};

export function extLabel(path: string): string {
  const ext = path.split('#')[0].split('.').pop()?.toLowerCase() ?? '';
  return EXT_LABELS[ext] ?? 'This';
}

/**
 * True for a target the vault can only hold as a file — `[[report.pdf]]`,
 * `![[clip.mp4]]` — so the client's create-on-unresolved-link fallback must not
 * write a note named `report.pdf` because of a typo.
 */
export function isAttachmentTarget(target: string): boolean {
  const t = target.split('#')[0].trim();
  return IMAGE_EXT_RE.test(t) || VIDEO_EXT_RE.test(t) || AUDIO_EXT_RE.test(t) || PDF_EXT_RE.test(t);
}
