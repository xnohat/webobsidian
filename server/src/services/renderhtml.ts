import { protectMarkdown, stripObsidianComments } from './markdownContext.js';
import {renderMarkdown,type RenderOpts} from './markdownTransclusion.js';
import { calloutIconSvg } from './markdownCallouts.js';
export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const IMG_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;

/**
 * Vault target of a markdown image URL (`attachments/my%20shot.png` -> `attachments/my shot.png`).
 * The folder is kept (relative images live next to the note and are resolved against its folder
 * by the public file route) and the URL is decoded once, so the caller can encode it exactly once.
 */
export function vaultTarget(url: string): string {
  let t = url.trim().replace(/^<|>$/g, '');
  try {
    t = decodeURIComponent(t);
  } catch {
    /* keep the raw text */
  }
  return t.replace(/^\.\//, '') || url;
}
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/;


/** Public rendering uses the same dialect and HTML policy as the browser. */
export async function renderNoteHtml(src: string, rawUrl: RenderOpts['rawUrl'], options: Omit<RenderOpts,'rawUrl'> = {}): Promise<string> {
  const html = await renderMarkdown(src,{...options,rawUrl});
  return decorateNoteHtml(html);
}
export function decorateNoteHtml(html:string):string{
  return html.replace(/(<span class="callout-icon" data-callout-icon="([\w-]+)">)<\/span>/g,
    (_all, start: string, slot: string) => `${start}${calloutIconSvg(slot)}</span>`);
}
/** Plain-text excerpt of a note body for the meta description (~160 chars). */
export function metaDescription(src: string, max = 160): string {
  let body = stripObsidianComments(src.replace(FRONTMATTER_RE, ''));
  body = body
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[\[[^\]]*\]\]/g, ' ') // embeds
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t: string, a?: string) => a ?? t)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/<[^>]+>/g, ' ') // raw HTML tags
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return body.length > max ? `${body.slice(0, max - 1).trimEnd()}…` : body;
}

/**
 * First shareable image of the note for og:image: a vault-embedded image
 * (returned as { vault }) or the first web image URL (returned as { url }).
 */
export function firstImage(src: string): { vault?: string; url?: string } | null {
  const protectedSource = protectMarkdown(stripObsidianComments(src.replace(FRONTMATTER_RE, '')));
  const body = protectedSource.text;
  for (const m of body.matchAll(/!\[\[([^\]]+?)\]\]/g)) {
    const t = protectedSource.restore(m[1]).split('|')[0].split('#')[0].trim();
    if (IMG_RE.test(t)) return { vault: t };
  }
  for (const m of body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const url = protectedSource.restore(m[1]).replace(/\s+"[^"]*"$/, '').trim();
    if (/^https?:/i.test(url) && IMG_RE.test(url.split('?')[0])) return { url };
    if (!/^(https?|data|blob|file):/i.test(url)) return { vault: vaultTarget(url) };
  }
  return null;
}
