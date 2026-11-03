import { markdownImages,markdownEmbedTarget,protectMarkdown, stripObsidianComments, selectHeading } from './markdownContext.js';
import { preprocess, frontmatterHtml, renderPreparedMarkdown } from './markdownRendering.js';
const isAttachmentTarget=(target:string)=>/\.(png|jpe?g|gif|svg|webp|bmp|ico|avif|mp4|webm|ogv|mov|mkv|mp3|wav|m4a|3gp|flac|ogg|oga|opus|pdf)$/i.test(target.split('#')[0].trim());
const IMG_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export interface RenderOpts {
  rawUrl: (p: string, sourcePath?: string) => string;
  sourcePath?: string;
  noteEmbedLink?: (path:string,fragment:string)=>{href:string;shareId:string}|undefined;
  strictLineBreaks?: boolean;
  /** Resolve a non-image embed target to its markdown content (transclusion). */
  resolveEmbed?: (target: string, sourcePath?: string,kind?:'wiki'|'markdown') => Promise<{ path: string; content: string } | null>;
}

const IMG_EMBED_RE = /!\[\[([^\]]+?)\]\]/g;
// Obsidian 1.14.5 renders six nested notes, then leaves a file link.
const MAX_EMBED_DEPTH = 6;

/** Shared by Live widgets and HTML Preview, so fragment selection cannot drift. */
export async function renderNoteEmbed(target: string, opts: RenderOpts, depth = 0,kind:'wiki'|'markdown'='wiki'): Promise<{ html: string; openTarget: string; path:string } | null> {
  if (!opts.resolveEmbed || depth >= MAX_EMBED_DEPTH) return null;
  const hash = target.indexOf('#');
  const path = (hash < 0 ? target : target.slice(0, hash)).trim();
  let fragment = hash < 0 ? '' : target.slice(hash + 1);
  if(kind==='markdown')try{fragment=decodeURIComponent(fragment)}catch{}
  const encodePath=(value:string)=>value.split('/').map(encodeURIComponent).join('/');
  const lookup=path||(kind==='markdown'&&opts.sourcePath?'/'+encodePath(opts.sourcePath):opts.sourcePath||'');
  const note = await opts.resolveEmbed(lookup, opts.sourcePath,kind);
  if (!note) return null;
  if(!/\.(md|markdown)$/i.test(note.path))return null;
  const stripped = note.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const selected = selectHeading(stripped, fragment);
  if (selected === null) return null;
  return { html: await renderMarkdown(selected, { ...opts, sourcePath: note.path }, depth + 1),
    openTarget: (kind==='markdown'?'/'+encodePath(note.path):note.path) + (hash < 0 ? '' : '#' + fragment),path:note.path };
}

/** Expand `![[note]]` transclusions inline (images are left for preprocess). */
async function expandEmbeds(src: string, opts: RenderOpts, depth: number): Promise<{ source: string; restore: (text: string) => string }> {
  if (!opts.resolveEmbed || depth >= MAX_EMBED_DEPTH) return { source: src, restore: text => text };
  let prefix = '\uE002embed';
  while (src.includes(prefix)) prefix += '_';
  const embeds: string[] = [];
  const protectedSource = protectMarkdown(stripObsidianComments(src));
  const markdown=markdownImages(protectedSource.text);
  const matches = [
    ...[...protectedSource.text.matchAll(IMG_EMBED_RE)].filter(m=>!markdown.some(r=>m.index!>=r.from&&m.index!<r.to)).map(m=>({from:m.index!,to:m.index!+m[0].length,target:protectedSource.restore(m[1].split('|')[0]).trim(),kind:'wiki' as const})),
    ...markdown.flatMap(image=>{
      const info=markdownEmbedTarget(protectedSource.restore(image.url));
      if(info.external||(/\.[^/.]+$/.test(info.path)&&! /\.(md|markdown)$/i.test(info.path)))return [];
      return [{from:image.from,to:image.to,target:info.url,kind:'markdown' as const}];
    }),
  ].sort((a,b)=>b.from-a.from);
  let out = protectedSource.text;
  for (const m of matches) {
    const target = m.target;
    const file = target.split('#')[0];
    // images, media and PDFs are rendered as elements in preprocess, not transcluded
    // (a PDF has no markdown body to inline — FR-21)
    if (IMG_RE.test(file) || isAttachmentTarget(file) || /\.(ya?ml|canvas)$/i.test(file)) continue;
    const rendered = await renderNoteEmbed(target, opts, depth,m.kind);
    if (!rendered) continue;
    const titleText=m.kind==='markdown'?rendered.path.split('/').pop()!.replace(/\.(md|markdown)$/i,''):target;
    const title = target.includes('#') ? '' : `<div class="embed-title">${esc(titleText)}</div>`;
    const hash=rendered.openTarget.indexOf('#'),fragment=hash<0?'':rendered.openTarget.slice(hash+1),link=opts.noteEmbedLink?.(rendered.path,fragment);
    const scope=link?` data-public-share="${esc(link.shareId)}"`:'';
    const open=link?`<a class="markdown-embed-link" href="${esc(link.href)}" title="Open embedded note" aria-label="Open embedded note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7"/></svg></a>`:'';
    const block = `<div class="embed-note" data-embed-target="${esc(rendered.openTarget)}" data-embed-kind="${m.kind}" data-embed-source="${esc(rendered.path)}"${scope}>${open}${title}${rendered.html}</div>`;
    out = out.slice(0,m.from)+`\n\n${prefix}${embeds.push(block)-1}\uE003\n\n`+out.slice(m.to);
  }
  return {
    source: protectedSource.restore(out),
    restore: text => text.replace(new RegExp(`(?:<p>)?${prefix}(\\d+)\uE003(?:</p>)?`, 'g'), (_, index) => embeds[+index]),
  };
}

export async function renderMarkdown(
  src: string,
  opts: RenderOpts,
  depth = 0,
): Promise<string> {
  const props = depth === 0 ? frontmatterHtml(src) : '';
  const expanded = await expandEmbeds(src, opts, depth);
  const pre = preprocess(expanded.source, p => opts.rawUrl(p, opts.sourcePath));
  return props + expanded.restore(renderPreparedMarkdown(pre, opts.strictLineBreaks));
}
