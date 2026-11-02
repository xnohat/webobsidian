import { markdownImages,markdownEmbedTarget,protectMarkdown, stripObsidianComments } from './markdownContext.js';
import { rehypeExternalEmbeds } from './embeds.js';
import {rehypePrepareWebFrames,rehypeRestoreWebFrames} from './webFrames.js';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { remarkSoftBreaks, remarkCallouts, expandInlineFootnotes, remarkTableCodeEscapes, rehypeFootnoteLabels } from './markdownDialect.js';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import {rehypeInlineStyles} from './htmlPolicy.js';
import { editableFrontmatter } from './frontmatterPolicy.js';

const VIDEO_EXT_RE = /\.(mp4|webm|ogv|mov|mkv)$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|3gp|flac|ogg|oga|opus)$/i;
const PDF_EXT_RE = /\.pdf$/i;

// Sanitize schema extended to keep the attributes our wikilinks/callouts use.
export const markdownSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []).filter(x=>x!=='align'), 'dataName'],
    // Default schema constrains a.className to footnote classes — drop that
    // entry and allow any class (internal-link / embed / tag / external-link).
    a: [
      ...(defaultSchema.attributes?.a ?? []).filter((x) => !(Array.isArray(x) && x[0] === 'className')),
      ['className'],
      ['dataWikilink'],
      ['dataHref'],
      ['dataLinkKind'],
      ['dataWebFrame'],['dataWebFrameWidth'],['dataWebFrameHeight'],['dataWebFrameFullscreen'],
    ],
    div: [...(defaultSchema.attributes?.div ?? []).filter(x=>!(Array.isArray(x)&&x[0]==='align')&&x!=='align'), ['align','left','center','right','justify'], ['className'], ['dataCallout'], ['dataCalloutFold']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className'], ['dataTex'], ['dataTexDisplay'], ['dataCalloutIcon'], ['style']],
    mark: [...(defaultSchema.attributes?.mark??[]),['style']],
    kbd: [...(defaultSchema.attributes?.kbd??[]),['style']],
    li: [...(defaultSchema.attributes?.li ?? []), ['className'], ['dataTask']],
    input: [['type'], ['checked'], ['disabled'], ['className'], ['dataTask']],
    img: [...(defaultSchema.attributes?.img ?? []), ['src'], ['alt'], ['dataEmbed']],
    video: [['src'], ['controls'], ['preload'], ['width'], ['height'], ['className'], ['dataEmbed'], ['loop'], ['playsInline']],
    audio: [['src'], ['controls'], ['controlsList'], ['preload'], ['className'], ['dataEmbed'], ['loop']],
    source: [['src'], ['type']],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), 'input', 'mark', 'u', 'video', 'audio', 'source'],
};

interface MdNode {
  type: string;
  url?: string;
  checked?: boolean | null;
  ordered?:boolean;
  depth?:number;
  value?: string;
  data?: { hName?:string;hProperties?: Record<string, unknown> };
  children?: MdNode[];
  position?: {start:{offset?:number};end:{offset?:number}};
}

/** Block references are invisible text with a navigable target, not DOM IDs.
 * Read parser-owned text and its source so escaped carets and code stay literal. */
type BlockTargets=Map<number,{id:string;node:MdNode}[]>;
function remarkBlockIds() {
  return (tree:MdNode,file:{value:unknown;data:Record<string,unknown>})=>{
    const source=String(file.value),suffix=/(?:^|\s)\^([a-zA-Z0-9-]+)[ \t]*$/;
    const targets:BlockTargets=new Map();file.data.blockTargets=targets;
    const attach=(node:MdNode,id:string)=>{
      const offset=node.position?.start.offset;if(offset!==undefined){const entries=targets.get(offset)??[];entries.push({node,id});targets.set(offset,entries)}
    };
    const visit=(parent:MdNode)=>{
      if(['code','inlineCode','html'].includes(parent.type))return;
      const siblings=parent.children;if(!siblings)return;
      for(let i=0;i<siblings.length;i++){
        const node=siblings[i],last=node.children?.at(-1),from=node.position?.start.offset,to=node.position?.end.offset;
        const raw=from!==undefined&&to!==undefined?source.slice(from,to):'';
        const match=node.type==='paragraph'&&last?.type==='text'&&suffix.test(last.value??'')?raw.match(suffix):null;
        if(match){
          if(raw.trim()==='^'+match[1]){
            const previous=siblings[i-1];if(previous&&previous.type!=='html')attach(['listItem','blockquote'].includes(parent.type)?parent:previous,match[1]);
            siblings.splice(i--,1);continue;
          }
          attach(['listItem','blockquote'].includes(parent.type)?parent:node,match[1]);last!.value=last!.value!.replace(suffix,'');
        }
        visit(node);
      }
    };visit(tree);
  };
}

/** Add only parser-owned targets after sanitizing raw HTML. Source positions
 * survive rehypeRaw; HTML attributes cannot forge a Markdown block's position. */
function rehypeBlockIds(){
  interface Element {type:string;tagName?:string;properties?:Record<string,unknown>;position?:MdNode['position'];children?:Element[]}
  return (tree:Element,file:{data:Record<string,unknown>})=>{
    const targets=file.data.blockTargets as BlockTargets|undefined;
    const tags:Record<string,string>={paragraph:'p',listItem:'li',blockquote:'blockquote',table:'table',code:'pre',thematicBreak:'hr'};
    const visit=(element:Element)=>{
      const offset=element.position?.start.offset,entries=offset===undefined?undefined:targets?.get(offset);
      for(const target of entries??[]){
        const node=target.node,tag=node.data?.hName??(node.type==='list'?(node.ordered?'ol':'ul'):node.type==='heading'?'h'+node.depth:tags[node.type]);
        if(element.type==='element'&&element.tagName===tag){element.properties??={};element.properties.dataBlockId=target.id}
      }
      element.children?.forEach(visit);
    };visit(tree);
  };
}

function remarkInternalLinkKinds() {
  return (tree: MdNode) => {
    const visit = (node: MdNode) => {
      if (node.type === 'link' && node.url && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(node.url)) {
        node.data ??= {};
        node.data.hProperties = { ...node.data.hProperties, 'data-link-kind': 'markdown' };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/**
 * Obsidian task semantics (§7): `[c]` with ANY single char is a task; any
 * non-space char counts as done. remark-gfm only recognizes ` `/`x`/`X`, so
 * custom states (`[/]`, `[-]`, `[>]`…) are turned into checkboxes here, and
 * every task <li> gets `data-task` so CSS can strike only x/X like Obsidian.
 */
function remarkObsidianTasks() {
  return (tree: MdNode) => {
    const visit = (node: MdNode) => {
      if (node.type === 'listItem') {
        node.data = node.data ?? {};
        if (node.checked === true || node.checked === false) {
          node.data.hProperties = {
            ...node.data.hProperties,
            className: 'task-list-item' + (node.checked ? ' is-checked' : ''),
            'data-task': node.checked ? 'x' : ' ',
          };
        } else {
          const para = node.children?.[0];
          const txt = para?.type === 'paragraph' ? para.children?.[0] : undefined;
          const m = txt?.type === 'text' ? txt.value?.match(/^\[(.)\] /) : null;
          if (m && para?.children && txt) {
            txt.value = txt.value!.slice(m[0].length);
            const done = m[1] !== ' ';
            node.data.hProperties = {
              ...node.data.hProperties,
              className: 'task-list-item' + (done ? ' is-checked' : ''),
              'data-task': m[1],
            };
            para.children.unshift({
              type: 'html',
              value: `<input type="checkbox" class="task-list-item-checkbox" disabled${done ? ' checked' : ''}> `,
            });
          }
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

const makeProcessor = (strictLineBreaks = false) => unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkTableCodeEscapes)
  // Obsidian dialect: single newline renders as <br> (breaks: true, §7)
  .use(remarkSoftBreaks, { strictLineBreaks })
  .use(remarkBlockIds)
  .use(remarkCallouts)
  .use(remarkObsidianTasks as any)
  .use(remarkInternalLinkKinds)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypePrepareWebFrames as any)
  .use(rehypeInlineStyles)
  .use(rehypeSanitize, markdownSchema as any)
  .use(rehypeBlockIds)
  .use(rehypeRestoreWebFrames as any)
  .use(rehypeFootnoteLabels)
  // Provider iframes are created only after the untrusted markup was sanitized.
  .use(rehypeExternalEmbeds as any)
  .use(rehypeStringify);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const IMG_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i;

/** Files without an inline renderer use the native generic file-card shape. */
export function isGenericFileEmbed(target:string):boolean{
  const file=target.split('#')[0];
  return /\.[^/.]+$/.test(file)&&!/\.(md|markdown|canvas|base)$/i.test(file)&&!IMG_RE.test(file)&&!VIDEO_EXT_RE.test(file)&&!AUDIO_EXT_RE.test(file)&&!PDF_EXT_RE.test(file);
}

/**
 * Markdown link targets are percent-encoded (`![](My%20File.png)`) and rawUrl()
 * encodes again, so decode once or `%20` becomes `%2520` and the file is missed.
 * try/catch: a lone `%` makes decodeURIComponent throw; the raw name is right then.
 * Only for `![](…)` — `![[wikilink]]` targets are literal, not encoded.
 */
function decodeLinkTarget(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/**
 * Pre-process Obsidian-flavored syntax before markdown parsing:
 *  - ![[image.png]]  → embedded image
 *  - ![[note]]       → embed link (rendered as link for now)
 *  - [[note|alias]]  → internal link
 *  - > [!note] ...   → callout
 */
// Tag body charset (§7) — same rule as the editor (needs a letter, not all digits).
const TAG_READ_RE = /(^|\s)(#[^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s]+)/g;

export function preprocess(src: string, rawUrl: (p: string) => string): string {
  // Strip YAML frontmatter (rendered separately as properties, like Obsidian)
  src = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  // Protect code (fenced + inline) so Obsidian syntax inside it stays literal —
  // e.g. `![[file]]` in backticks is sample text, not an embed. Restored below.
  const protectedSource = protectMarkdown(stripObsidianComments(src));
  const { stash } = protectedSource;
  const urlFor = (target: string) => rawUrl(protectedSource.restore(target));
  const escape = (value: string) => esc(protectedSource.restore(value));
  src = expandInlineFootnotes(protectedSource.text);
  // Math → placeholders rendered by KaTeX after sanitize (display first).
  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) =>
    stash(`<span class="math math-block" data-tex="${escape(tex.trim())}" data-tex-display="1">${escape(tex)}</span>`),
  );
  src = src.replace(
    /(?<![$\\])\$(?![\s$])((?:\\\$|[^$\n])+?)(?<![\s\\])\$(?!\d|\$)/g,
    (_m, tex: string) => stash(`<span class="math math-inline" data-tex="${escape(tex)}">${escape(tex)}</span>`),
  );
  // ==Highlight== → <mark> (open not followed by space/=, §7)
  src = src.replace(/==(?![\s=])(.+?)==/g, '<mark>$1</mark>');
  // Embeds first (![[...]])
  const markdownRanges=markdownImages(src);
  src = src.replace(/!\[\[([^\]]+?)\]\]/g, (m, inner: string,offset:number) => {
    if(markdownRanges.some(r=>offset>=r.from&&offset<r.to))return m;
    if (inner.includes('[[')) return m;
    const pi = inner.indexOf('|');
    const t = (pi > 0 ? inner.slice(0, pi) : inner).trim();
    const fragAt = t.indexOf('#');
    const file = (fragAt > 0 ? t.slice(0, fragAt) : t).trim();
    if (IMG_RE.test(file)) {
      // size param: last `|` segment `300` or `300x200` (§7)
      let size = '';
      if (pi > 0) {
        const segs = inner.split('|');
        const sm = segs[segs.length - 1].match(/^\s*([0-9]+)\s*(?:x\s*([0-9]+)\s*)?$/);
        if (sm) size = ` width="${sm[1]}"${sm[2] ? ` height="${sm[2]}"` : ''}`;
      }
      return stash(`<img src="${urlFor(file)}" alt="${escape(t)}" data-embed="1"${size} />`);
    }
    if (VIDEO_EXT_RE.test(file) || AUDIO_EXT_RE.test(file)) {
      const isVid = VIDEO_EXT_RE.test(file);
      // size param (video only): last `|` segment `300` / `300x200` → width/height
      let size = '';
      if (isVid && pi > 0) {
        const segs = inner.split('|');
        const sm = segs[segs.length - 1].match(/^\s*([0-9]+)\s*(?:x\s*([0-9]+)\s*)?$/);
        if (sm) size = ` width="${sm[1]}"${sm[2] ? ` height="${sm[2]}"` : ''}`;
      }
      const tag = isVid ? 'video' : 'audio';
      return `<${tag} class="media-embed" src="${urlFor(file)+(fragAt>0?escape(t.slice(fragAt)):'' )}" controls${isVid?'':' controlslist="nodownload"'} preload="metadata" data-embed="1"${size}></${tag}>`;
    }
    if (PDF_EXT_RE.test(file)) {
      // FR-21: vault PDFs use the dedicated viewer, not an opaque web frame.
      // Emit an inert link carrying the target; Preview.tsx swaps it for the viewer in
      // its post-render pass. The href is the real file URL, so a consumer that never
      // runs that pass still has a working link instead of a dead one.
      // Viewer options stay in the URL fragment, outside the file API path.
      const segs = inner.split('|');
      const last = (segs[segs.length - 1] ?? '').trim();
      const label = (pi > 0 && !/^\d+\s*(?:x\s*\d+)?$/.test(last) ? last : file.split('/').pop() || file);
      return stash(`<a class="pdf-embed" data-href="${escape(file)}" href="${escape(urlFor(file)+(fragAt>0?t.slice(fragAt):''))}">${escape(label)}</a>`);
    }
    if(/\.canvas$/i.test(file)){
      return stash(`<a class="canvas-embed" data-href="${escape(t)}" href="${escape(urlFor(file))}">${escape(file.split('/').pop()||file)}</a>`);
    }
    if (isGenericFileEmbed(file)) {
      return stash(`<a class="internal-link embed file-embed mod-generic" data-wikilink="${escape(t)}" href="#">${escape(file.split('/').pop() || file)}</a>`);
    }
    return stash(`<a class="internal-link embed" data-wikilink="${escape(t)}" href="#">${escape(inner)}</a>`);
  });
  // Standard Markdown embeds share the same native types as wiki embeds.
  // Work from parser ranges, backwards, so reference definitions and nested
  // parentheses cannot be truncated by a destination regex.
  for(const image of markdownImages(src).reverse()){
    const url=protectedSource.restore(image.url),target=markdownEmbedTarget(url);
    const file=target.path,raw=target.encodedPath;
    let alt=protectedSource.restore(image.alt),size='';
    const match=alt.match(/\|\s*(\d+)\s*(?:x\s*(\d+)\s*)?$/);
    if(match){alt=alt.slice(0,match.index);size=` width="${match[1]}"${match[2]?` height="${match[2]}"`:''}`}
    const srcUrl=target.external?target.url:urlFor(file)+target.fragment;
    const kind=' data-link-kind="markdown"';let html:string;
    if(!target.external&&(VIDEO_EXT_RE.test(file)||AUDIO_EXT_RE.test(file))){
      const video=VIDEO_EXT_RE.test(file),tag=video?'video':'audio';
      html=`<${tag} class="media-embed" src="${escape(srcUrl)}" controls${video?'':' controlslist="nodownload"'} preload="metadata" data-embed="1"${video?size:''}></${tag}>`;
    }else if(!target.external&&PDF_EXT_RE.test(file)){
      html=`<a class="pdf-embed" data-href="${escape(raw)}"${kind} href="${escape(srcUrl)}">${escape(alt||file.split('/').pop()||file)}</a>`;
    }else if(!target.external&&/\.canvas$/i.test(file)){
      html=`<a class="canvas-embed" data-href="${escape(raw)}"${kind} href="${escape(srcUrl)}">${escape(file.split('/').pop()||file)}</a>`;
    }else if(!target.external&&!IMG_RE.test(file)){
      const generic=isGenericFileEmbed(raw),classes=generic?' file-embed mod-generic':'';
      html=`<a class="internal-link embed${classes}" data-wikilink="${escape(raw+target.fragment)}"${kind} href="#">${escape(alt||file.split('/').pop()||file)}</a>`;
    }else html=`<img src="${escape(srcUrl)}" alt="${escape(alt)}"${size} />`;
    src=src.slice(0,image.from)+stash(html)+src.slice(image.to);
  }
  // Links [[target|alias]] — alias after the FIRST `|`; default display text in
  // reading view is `href.split('#').join(' > ')` (§7).
  src = src.replace(/\[\[([^\]]+?)\]\]/g, (m, inner: string) => {
    if (inner.includes('[[')) return m;
    const pi = inner.indexOf('|');
    const target = (pi > 0 ? inner.slice(0, pi) : inner).replace(/\u00A0/g, ' ').trim().normalize('NFC');
    const alias = pi > 0 ? inner.slice(pi + 1).trim() : null;
    const label = alias || target.split('#').filter(Boolean).join(' > ') || target;
    return stash(`<a class="internal-link" data-wikilink="${escape(target)}" href="#">${escape(label)}</a>`);
  });
  // Inline tags → pills (after links so attribute/label text is untouched).
  src = src.replace(TAG_READ_RE, (m, pre: string, tag: string) => {
    if (/^#\d+$/.test(tag) || !/[a-z]/i.test(tag)) return m;
    return `${pre}<a class="tag" href="#">${escape(tag)}</a>`;
  });
  // Restore protected code spans now that Obsidian-syntax transforms are done.
  return protectedSource.restore(src);
}

/** Render leading YAML frontmatter as an Obsidian-like properties block. */
export function frontmatterHtml(src: string): string {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return '';
  if (!editableFrontmatter(m[1])) return `<pre class="frontmatter-source"><code>${esc(m[0])}</code></pre>`;
  const unquote = (s: string) => s.replace(/^["'](.*)["']$/, '$1');
  type P = { key: string; vals: string[]; list: boolean };
  const props: P[] = [];
  let cur: P | null = null;
  for (const line of m[1].split('\n')) {
    const li = line.match(/^\s*-\s+(.+)$/);
    const kv = line.match(/^([\w .-]+?):\s*(.*)$/);
    if (li && cur) {
      cur.list = true;
      cur.vals.push(unquote(li[1].trim()));
    } else if (kv) {
      cur = { key: kv[1].trim(), vals: [], list: false };
      const val = kv[2].trim();
      const arr = val.match(/^\[(.*)\]$/);
      if (arr) {
        cur.list = true;
        cur.vals = arr[1].split(',').map((s) => unquote(s.trim())).filter(Boolean);
      } else if (val) {
        cur.vals = [unquote(val)];
      }
      props.push(cur);
    }
  }
  const rows = props
    .map((p) => {
      const val = p.list
        ? p.vals.map((v) => `<span class="prop-pill">${esc(v)}</span>`).join(' ')
        : esc(p.vals[0] ?? '');
      return `<div class="prop-row"><span class="prop-key">${esc(p.key)}</span><span class="prop-val">${val}</span></div>`;
    })
    .join('');
  return rows ? `<div class="properties">${rows}</div>` : '';
}


const processor = makeProcessor();
const strictProcessor = makeProcessor(true);
export function renderPreparedMarkdown(source: string, strictLineBreaks = false): string {
  return String((strictLineBreaks ? strictProcessor : processor).processSync(source));
}
export function renderMarkdownBody(source: string, rawUrl: (path: string) => string, strictLineBreaks = false): string {
  return renderPreparedMarkdown(preprocess(source, rawUrl), strictLineBreaks);
}
