import {setLocalizedText} from './i18n/runtime';
import {t as uiText} from "./i18n/runtime";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import {mountDiagram,mountDiagramBlocks} from './diagram';
import { frontmatterTitle } from './title';
import {propertyIconSvg} from './propertyPresentation';
import {createPdfViewer,destroyPdfViewer} from './pdfViewer';
import {pdfFileActions} from './pdfFileActions';
import {createNoteEmbedOpenButton,addNoteEmbedOpenButtons} from './noteEmbed';
import {mountPdfEmbeds} from './pdfEmbeds';
import {createCanvasEmbed,destroyCanvasEmbed,mountCanvasEmbeds} from './canvasEmbed';
import {embedAction,embedTokenAt,imageLabelEnd,revealEmbedSource,imageActions,mountImageActions} from './embedActions';
import { renderMarkdownBody, renderPreparedMarkdown,isGenericFileEmbed } from '../../../server/src/services/markdownRendering';
import { StateField, StateEffect, type EditorState, type Range, type Text } from '@codemirror/state';
import { syntaxTree,LanguageDescription } from '@codemirror/language';
import {languages} from '@codemirror/language-data';
import { markdownLiteralRanges,markdownImages,markdownEmbedTarget,type MarkdownImage,isEscaped, preserveLiteralTags, findObsidianComments, stripObsidianComments, footnoteRanges, type SourceRange } from '../../../server/src/services/markdownContext';
import { editableFrontmatter } from '../../../server/src/services/frontmatterPolicy';
import { CALLOUT_SLOT, CALLOUT_RE, calloutDefaultTitle, calloutIconSvg } from './callouts';
import { openLightbox } from './imageLightbox';
import { VIDEO_EXT_RE, AUDIO_EXT_RE, PDF_EXT_RE, IMAGE_EXT_RE } from './media';
import { optionsFor, type PropOption } from './propOptions';
import { useStore } from './store';
import { themedPopupHost } from './theme';
import { COLOR_STYLE_RE } from './colorFormatting';
import { resolveExternalEmbed, createEmbedElement, type ExternalEmbed } from './embeds';

/**
 * Live Preview for CodeMirror 6 — an Obsidian-style WYSIWYG editing mode.
 *
 * Formatting is *rendered* (bold is bold, italic italic, code monospaced, headings
 * sized, links/embeds/checkboxes become widgets) while the raw Markdown syntax is
 * concealed. Syntax for a given span is revealed only when the caret is inside
 * THAT span — not the whole paragraph — so editing one word never dumps raw
 * markup across the line. (PRD FR-2)
 */

let openLink: (target: string, kind?: 'wiki' | 'markdown',from?:string) => void = () => {};
export function setLivePreviewLinkHandler(fn: (target: string, kind?: 'wiki' | 'markdown',from?:string) => void) {
  openLink = fn;
}

export interface LpMenuItem {
  label: string;
  icon?: string;
  onClick?: () => void;
  submenu?: LpMenuItem[];
  separator?: boolean;
}
let openMenu: (m: { x: number; y: number; items: LpMenuItem[] }) => void = () => {};
export function setLivePreviewMenuHandler(fn: (m: { x: number; y: number; items: LpMenuItem[] }) => void) {
  openMenu = fn;
}

/** Path of the note being rendered — relative image refs resolve against its folder. */
let notePath = '';
export function setLivePreviewNotePath(p: string | null) {
  notePath = p ?? '';
}

/** Trash-icon click on an image: `target` is the raw vault reference (null for web URLs). */
export interface ImageDeleteRequest {
  target: string | null;
  kind?:'wiki'|'markdown';
  view: EditorView;
  /** Remove the image's Markdown reference from the note. */
  remove: () => void;
}
let imageDeleteHandler: (r: ImageDeleteRequest) => void = (r) => r.remove();
export function setLivePreviewImageDeleteHandler(fn: (r: ImageDeleteRequest) => void) {
  imageDeleteHandler = fn;
}

export interface PropSuggestion {
  key: string;
  type: string;
  count: number;
}
let propertyProvider: () => Promise<PropSuggestion[]> = async () => [];
export function setLivePreviewPropertyProvider(fn: () => Promise<PropSuggestion[]>) {
  propertyProvider = fn;
}

// Per-vault property type registry (mirrors Obsidian's `.obsidian/types.json`).
let propTypeRegistry: Record<string, string> = {};
export function setLivePreviewPropertyTypes(types: Record<string, string>) {
  propTypeRegistry = types ?? {};
}
let persistPropertyType: (key: string, type: string) => Promise<Record<string, string>> = async () => ({});
export function setLivePreviewPropertyTypeSetter(fn: (key: string, type: string) => Promise<Record<string, string>>) {
  persistPropertyType = fn;
}

/**
 * Start Obsidian's "Add file property" flow: focus a new property-key field in
 * the Properties widget and open the key suggester dropdown — the same UI the
 * widget's own "+ Add property" button drives. If the note has no frontmatter
 * yet, an empty block is created first so the widget (and its button) renders.
 * Requires Live Preview, non-readonly — the caller switches to live mode first.
 */
export function triggerAddProperty(view: EditorView): void {
  const click = (): boolean => {
    const btn = view.dom.querySelector<HTMLElement>('.cm-props-add');
    if (!btn) return false;
    btn.scrollIntoView({ block: 'nearest' });
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return true;
  };
  if (click()) return;
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(view.state.doc.toString())) {
    view.dispatch({ changes: { from: 0, to: 0, insert: '---\n\n---\n\n' } });
  }
  // The widget mounts on the next decoration build; poll briefly for its button.
  let tries = 0;
  const iv = window.setInterval(() => {
    if (click() || ++tries > 30) window.clearInterval(iv);
  }, 25);
}

// Suggestions for list-property item values (vault tags for the `tags` property).
let tagProvider: () => Promise<string[]> = async () => [];
export function setLivePreviewTagProvider(fn: () => Promise<string[]>) {
  tagProvider = fn;
}

/* ---------------- widgets ---------------- */

// Small "external link" glyph appended after outgoing http(s) links, like Obsidian.
function externalLinkIcon(): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cm-external-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

class WikilinkWidget extends WidgetType {
  /** `aria` = default display text, set when an alias overrides it (like Obsidian). */
  constructor(readonly target: string, readonly label: string, readonly embed: boolean, readonly aria?: string,readonly kind:'wiki'|'markdown'='wiki') {
    super();
  }
  eq(o: WikilinkWidget) {
    return o.target === this.target && o.label === this.label && o.embed === this.embed && o.aria === this.aria && o.kind===this.kind;
  }
  toDOM() {
    const a = document.createElement('a');
    a.className = 'cm-hmd-internal-link cm-wikilink internal-link' + (this.embed ? ' embed' : '');
    const yamlEmbed = this.embed && isGenericFileEmbed(this.target);
    if (yamlEmbed) a.className += ' internal-embed file-embed mod-generic';
    a.textContent = yamlEmbed ? (this.kind==='markdown'?decodeLinkTarget(this.target.split('#')[0]):this.target.split('#')[0]).split('/').pop()! : this.label;
    if (this.aria) a.setAttribute('aria-label', this.aria);
    a.href='#';a.onmousedown=e=>{e.preventDefault();e.stopPropagation()};
    a.onclick=e=>{e.preventDefault();e.stopPropagation();openLink(this.target,this.kind)};
    return a;
  }
  ignoreEvent() {return true;}
}

class MdLinkWidget extends WidgetType {
  constructor(readonly label: string, readonly href: string) {
    super();
  }
  eq(o: MdLinkWidget) {
    return o.label === this.label && o.href === this.href;
  }
  toDOM() {
    const external = /^(?:https?:|obsidian:)\/\//i.test(this.href);
    const a = document.createElement('a');
    a.className = 'cm-md-link' + (external ? ' external-link' : ' internal-link');
    // Parse in link-label context: standalone Markdown would turn "1. Title"
    // into a list and a URL label into a second, nested link.
    const template = document.createElement('template');
    template.innerHTML = renderMarkdownBody(`[${this.label}](#)`, attachmentUrl);
    const label = template.content.querySelector('p > a');
    if (label) a.append(...Array.from(label.childNodes));
    else a.textContent = this.label;
    for (const code of a.querySelectorAll('code')) code.classList.add('cm-code');
    a.title = this.href;
    if (external) a.appendChild(externalLinkIcon());
    a.href=external?this.href:'#';a.onmousedown=e=>{e.preventDefault();e.stopPropagation()};
    a.onclick=e=>{e.preventDefault();e.stopPropagation();if(external)window.open(this.href,'_blank','noopener');else openLink(this.href,'markdown')};
    return a;
  }
  ignoreEvent() {return true;}
}

class BareUrlWidget extends WidgetType {
  constructor(readonly url: string) {
    super();
  }
  eq(o: BareUrlWidget) {
    return o.url === this.url;
  }
  toDOM() {
    const a = document.createElement('a');
    a.className = 'cm-url external-link';
    a.href = this.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = this.url;
    a.onmousedown = event => event.preventDefault();
    a.onclick = event => { event.preventDefault(); window.open(this.url, '_blank', 'noopener'); };
    return a;
  }
  ignoreEvent() {
    return true;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super();
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked && o.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-task-checkbox';
    box.checked = this.checked;
    box.onmousedown = (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos, to: this.pos + 1, insert: this.checked ? ' ' : 'x' } });
    };
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

const pointX = (e: MouseEvent | TouchEvent): number =>
  'touches' in e ? (e.touches[0] ?? e.changedTouches[0]).clientX : e.clientX;

/**
 * Write a new pixel width back into the embed source that `wrap` renders, as the
 * Obsidian size param: `![[img|W]]` for wikilink embeds, `![alt|W](url)` for
 * markdown images. The widget's document position is recovered via posAtDOM, then
 * the embed token covering it is re-found and rewritten (an existing trailing
 * numeric size segment is replaced; otherwise one is appended).
 */
function writeImageWidth(view: EditorView, wrap: HTMLElement, width: number,sourceVisible=false): void {
  if(view.state.readOnly)return;
  let pos: number;
  try {
    pos = view.posAtDOM(wrap);
  } catch {
    return;
  }
  const line = view.state.doc.lineAt(pos);
  const off = pos - line.from;
  const isSize = (s: string) => /^\s*\d+\s*(?:x\s*\d+\s*)?$/.test(s);
  const withSize = (segs: string[]): string => {
    if (segs.length > 1 && isSize(segs[segs.length - 1])) segs.pop();
    segs.push(String(width));
    return segs.join('|');
  };
  const token=embedTokenAt(view,wrap,sourceVisible);if(!token)return;
  let insert:string;
  if(token.source.startsWith('![['))insert=`![[${withSize(token.source.slice(3,-2).split('|'))}]]`;
  else{
    const close=imageLabelEnd(token.source);if(close<0)return;
    const label=token.source.slice(2,close);let tail=token.source.slice(close+1);
    if(!tail||tail==='[]')tail=`[${label}]`;
    insert=`![${withSize(label.split('|'))}]${tail}`;
  }
  view.dispatch({changes:{from:token.from,to:token.to,insert}});
}

/**
 * Remove the image token (`![[img]]` / `![alt](url)`) a rendered image widget
 * stands for. A line left empty by the removal is dropped with its newline.
 */
function removeImageToken(view: EditorView, wrap: HTMLElement,sourceVisible=false): void {
  let pos: number;
  try {
    pos = view.posAtDOM(wrap);
  } catch {
    return;
  }
  const token=embedTokenAt(view,wrap,sourceVisible);if(!token)return;
  let {from,to}=token;const first=view.state.doc.lineAt(from),last=view.state.doc.lineAt(to);
  if((view.state.doc.sliceString(first.from,from)+view.state.doc.sliceString(to,last.to)).trim()===''){
    from=first.from;to=last.to;if(to<view.state.doc.length)to++;else if(from>0)from--;
  }
  view.dispatch({changes:{from,to,insert:''},userEvent:'delete'});
}

const TRASH_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

class ImageWidget extends WidgetType {
  /** `width`/`height` from the Obsidian size param `![[img|300]]` / `![[img|300x200]]`. */
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width?: number,
    readonly height?: number,
    /** Raw vault reference (null for web URLs) — what the trash icon deletes. */
    readonly target: string | null = null,
    readonly canEditSource = true,
    readonly sourceVisible = false,
    readonly linkKind:'wiki'|'markdown'='wiki',
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return o.src === this.src && o.width === this.width && o.height === this.height && o.alt===this.alt && o.target===this.target && o.canEditSource===this.canEditSource && o.sourceVisible===this.sourceVisible&&o.linkKind===this.linkKind;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-image-wrap';
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.className = 'cm-embed-image image-embed';
    img.draggable = false;
    if (this.width) img.width = this.width;
    if (this.height) img.height = this.height;
    // Missing attachment → Obsidian-style "could not be found" box.
    img.onerror = () => {
      img.remove();
      wrap.querySelectorAll('.cm-image-resize').forEach((h) => h.remove());
      const miss = document.createElement('span');
      miss.textContent = '';
      wrap.appendChild(miss);
      embedNotFound(miss, this.alt);
    };
    // Plain click (no drag) → full-screen zoom/pan viewer.
    img.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(this.src, this.alt);
    });
    wrap.appendChild(img);
    imageActions(wrap,img,this.canEditSource?()=>revealEmbedSource(view,wrap,this.sourceVisible,true):undefined);
    if(!this.canEditSource)return wrap;

    // Hover trash icon (top-right) — removes the reference and, when nothing else
    // uses the file, the attachment itself (decided by the delete handler).
    const del = document.createElement('span');
    del.className = 'cm-image-delete';
    setLocalizedText(del, "editor.menu.delete-image", {}, "title");
    del.setAttribute('role', 'button');
    del.innerHTML = TRASH_SVG;
    del.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    del.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (view.state.readOnly) return;
      imageDeleteHandler({ target: this.target,kind:this.linkKind,view, remove: () => removeImageToken(view, wrap,this.sourceVisible) });
    });
    wrap.appendChild(del);

    // Drag-to-resize — left/right edge bars; width is written back as `|W`,
    // keeping aspect ratio (height auto), like Obsidian's image resize.
    const startResize = (e: MouseEvent | TouchEvent, side: 'left' | 'right') => {
      if(view.state.readOnly)return;
      e.preventDefault();
      e.stopPropagation();
      const startX = pointX(e);
      const startW = img.getBoundingClientRect().width;
      const maxW = Math.max(80, view.contentDOM.clientWidth);
      let curW = Math.round(startW);
      wrap.classList.add('is-resizing');
      const onMove = (ev: MouseEvent | TouchEvent) => {
        if(view.state.readOnly)return;
        if ('touches' in ev) ev.preventDefault();
        const dx = pointX(ev) - startX;
        curW = Math.min(maxW, Math.max(40, Math.round(side === 'right' ? startW + dx : startW - dx)));
        img.style.width = curW + 'px';
        img.style.height = 'auto';
        img.setAttribute('width', String(curW));
        img.removeAttribute('height');
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);
        wrap.classList.remove('is-resizing');
        writeImageWidth(view, wrap, curW,this.sourceVisible);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    };
    for (const side of ['left', 'right'] as const) {
      const h = document.createElement('span');
      h.className = `cm-image-resize cm-image-resize-${side}`;
      h.addEventListener('mousedown', (e) => startResize(e, side));
      h.addEventListener('touchstart', (e) => startResize(e, side), { passive: false });
      wrap.appendChild(h);
    }
    return wrap;
  }
}

/** Embedded audio/video player for `![[clip.mp4]]` / `![[song.mp3]]` (FR-2). */
class MediaWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly kind: 'video' | 'audio',
    readonly width?: number,
    readonly height?: number,
  ) {
    super();
  }
  eq(o: MediaWidget) {
    return o.src === this.src && o.kind === this.kind && o.width === this.width && o.height===this.height;
  }
  // Let the native player controls receive pointer/keyboard events (same as the
  // note-embed widget) instead of CodeMirror handling them.
  ignoreEvent() {
    return true;
  }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = `cm-media-wrap cm-media-${this.kind}`;
    const el = document.createElement(this.kind) as HTMLMediaElement;
    el.src = this.src;
    el.controls = true;
    if(this.kind==='audio')el.setAttribute('controlslist','nodownload');
    el.preload = 'metadata';
    el.className = this.kind === 'video' ? 'cm-embed-video media-embed' : 'cm-embed-audio media-embed';
    if (this.kind === 'video' && this.width) (el as HTMLVideoElement).width = this.width;
    if (this.kind === 'video' && this.height) (el as HTMLVideoElement).height = this.height;
    // Missing attachment → Obsidian-style "could not be found" box.
    el.onerror = () => {
      el.remove();
      const miss = document.createElement('span');
      wrap.appendChild(miss);
      embedNotFound(miss, this.alt);
    };
    wrap.appendChild(el);
    return wrap;
  }
}

/** Inline players are built only for the supported media providers. */
class ExternalEmbedWidget extends WidgetType {
  constructor(readonly embed: ExternalEmbed) {
    super();
  }
  eq(o: ExternalEmbedWidget) {
    return o.embed.src === this.embed.src;
  }
  ignoreEvent() {
    return true;
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-external-embed-wrap';
    wrap.appendChild(createEmbedElement(this.embed));
    return wrap;
  }
}

/**
 * Embedded PDF shares the same controls, scaling and page-height layout as Preview.
 */
class PdfEmbedWidget extends WidgetType {
  constructor(readonly src: string, readonly path: string, readonly origin: string,readonly canEditSource:boolean,readonly sourceVisible=false,readonly reading=false,readonly kind:'wiki'|'markdown'='wiki') {
    super();
  }
  eq(o: PdfEmbedWidget) {
    return o.src === this.src && o.path === this.path && o.origin === this.origin && o.canEditSource===this.canEditSource && o.sourceVisible===this.sourceVisible && o.reading===this.reading && o.kind===this.kind;
  }
  /** Let PDF controls and text selection receive events instead of CodeMirror. */
  ignoreEvent() {
    return true;
  }
  toDOM(view:EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-embed-pdf pdf-embed';
    const name = (this.kind==='markdown'?decodeLinkTarget(this.path):this.path).split('/').pop() ?? this.path;
    const edit=this.canEditSource?()=>revealEmbedSource(view,wrap,this.sourceVisible):undefined;
    const target=this.path+(this.path.includes('#')?'':this.src.includes('#')?this.src.slice(this.src.indexOf('#')):'');
    wrap.append(createPdfViewer(this.src,name,()=>{void (this.kind==='markdown'?useStore.getState().openWikilink(target,'markdown',this.origin):useStore.getState().openAttachment(target,this.origin))},edit,{fixedHeightIncludesToolbar:!this.reading,fileActions:pdfFileActions(target,this.origin,{linkKind:this.kind}),missingLabel:target}));
    return wrap;
  }
  destroy(dom:HTMLElement){const reader=dom.querySelector<HTMLElement>('.pdf-reader');if(reader)destroyPdfViewer(reader)}
}

/* ---------------- callouts (§21) — constants shared with Reading view ---------------- */

/** Icon (+ optional default title + fold chevron) replacing the `> [!type]` marker. */
class CalloutHeadWidget extends WidgetType {
  constructor(
    readonly slot: string,
    readonly defaultTitle: string,
    readonly fold: string, // '', '+', '-'
    readonly folded: boolean,
    readonly titleFrom: number,
  ) {
    super();
  }
  eq(o: CalloutHeadWidget) {
    return (
      o.slot === this.slot &&
      o.defaultTitle === this.defaultTitle &&
      o.fold === this.fold &&
      o.folded === this.folded &&
      o.titleFrom === this.titleFrom
    );
  }
  toDOM(view: EditorView) {
    const span = document.createElement('span');
    const icon = document.createElement('span');
    icon.className = 'cm-callout-icon';
    icon.innerHTML = calloutIconSvg(this.slot);
    span.appendChild(icon);
    if (this.defaultTitle) {
      const t = document.createElement('span');
      t.className = 'cm-callout-title';
      t.textContent = this.defaultTitle;
      span.appendChild(t);
    }
    return span;
  }
  ignoreEvent(e: Event) {
    return e.type === 'mousedown';
  }
}

class CalloutFoldWidget extends WidgetType {
  constructor(readonly folded:boolean,readonly from:number){super()}
  eq(o:CalloutFoldWidget){return o.folded===this.folded&&o.from===this.from}
  toDOM(view:EditorView){const ch=document.createElement('span');ch.className='cm-callout-fold'+(this.folded?' is-folded':'');ch.setAttribute('role','button');ch.setAttribute('aria-label','Toggle callout');ch.setAttribute('aria-expanded',String(!this.folded));ch.tabIndex=0;ch.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';const toggle=()=>view.dispatch({effects:toggleCalloutFold.of(this.from)});ch.onmousedown=e=>{e.preventDefault();toggle()};ch.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}};return ch}
  ignoreEvent(){return true}
}
class CalloutSourceWidget extends WidgetType {
  constructor(readonly from:number,readonly to:number){super()}
  eq(o:CalloutSourceWidget){return o.from===this.from&&o.to===this.to}
  toDOM(view:EditorView){const wrap=document.createElement('span');wrap.className='cm-callout-source';const button=embedAction('Edit callout','source',()=>{if(view.state.readOnly)return;view.dispatch({selection:{anchor:this.from,head:this.to},effects:EditorView.scrollIntoView(this.from),userEvent:'select'});view.focus()});button.classList.add('cm-callout-edit');wrap.append(button);return wrap}
  ignoreEvent(){return true}
}

/* ---------------- math (KaTeX, lazy-loaded like Obsidian's MathJax) ---------------- */

let katexPromise: Promise<typeof import('katex')['default']> | null = null;
function ensureKatex() {
  if (!katexPromise) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
      ([k]) => k.default,
    );
  }
  return katexPromise;
}

function addBlockSourceAction(root:HTMLElement,view:EditorView,range:SourceRange){
 const actions=document.createElement('span');actions.className='cm-block-actions';
 const button=embedAction('Edit block','source',()=>{if(view.state.readOnly)return;view.dispatch({selection:{anchor:range.from,head:range.to},effects:EditorView.scrollIntoView(range.from),userEvent:'select'});view.focus()});button.classList.add('cm-block-edit');actions.append(button);root.append(actions);
}
class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean,readonly source?:SourceRange,readonly canEditSource=false) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display&&o.source?.from===this.source?.from&&o.source?.to===this.source?.to&&o.canEditSource===this.canEditSource;
  }
  toDOM(view:EditorView) {
    const span = document.createElement('span');
    span.className = 'cm-math-rendered' + (this.display ? ' math-block' : ' math-inline');
    span.textContent = this.tex; // shown until KaTeX loads
    void ensureKatex().then((katex) => {
      try {
        katex.render(this.tex, span, { throwOnError: false, displayMode: this.display });
        if(this.display&&this.source&&this.canEditSource)addBlockSourceAction(span,view,this.source);if(span.isConnected)view.requestMeasure();
      } catch {
        /* keep raw tex */
      }
    });
    return span;
  }
  ignoreEvent(event:Event) {return !!(event.target as HTMLElement|null)?.closest?.('.cm-block-actions');}
}

class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-hr-widget';
    span.appendChild(document.createElement('hr'));
    return span;
  }
}

function buildDisplayMath(state:EditorState):DecorationSet{
 if(!state.field(livePreviewState,false))return Decoration.none;
 const doc=state.doc,readonly=state.field(livePreviewReadonly,false)??false,literal=[...documentLiteralRanges(state),...documentComments(state)],ranges:Range<Decoration>[]=[];
 const fm=doc.toString().match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0].length??0;
 for(let n=1;n<=doc.lines;n++){
  const line=doc.line(n);if(line.from<fm||!/^ {0,3}\$\$[ \t]*$/.test(line.text)||literal.some(r=>line.from>=r.from&&line.from<r.to))continue;
  let end=n+1;while(end<=doc.lines&&!/^ {0,3}\$\$[ \t]*$/.test(doc.line(end).text))end++;
  if(end>doc.lines)continue;
  const from=line.from,to=doc.line(end).to,touched=!readonly&&state.selection.ranges.some(r=>r.from<=to&&r.to>=from);
  if(!touched){const tex=doc.sliceString(line.to+1,doc.line(end).from).trim();ranges.push(Decoration.replace({widget:new MathWidget(tex,true,{from,to},!readonly),block:true}).range(from,to))}n=end;
 }return Decoration.set(ranges,true);
}
export const displayMathField=StateField.define<DecorationSet>({create:buildDisplayMath,update(value,tr){return tr.docChanged||tr.selection||tr.effects.some(e=>e.is(setLivePreviewEnabled)||e.is(setLivePreviewReadonly))?buildDisplayMath(tr.state):value.map(tr.changes)},provide:field=>EditorView.decorations.from(field)});

/* ---------------- note embeds (transclusion, like Obsidian ![[note]]) ---------------- */

// Injected from Editor.tsx: resolves a wikilink target and returns rendered,
// sanitized HTML (api.resolve + renderMarkdown — same pipeline as Reading view).
let noteEmbedProvider: (target: string,kind?:'wiki'|'markdown') => Promise<{ html: string;path?:string } | null> = async () => null;
export function setLivePreviewNoteEmbedProvider(fn: (target: string,kind?:'wiki'|'markdown') => Promise<{ html: string;path?:string } | null>) {
  noteEmbedProvider = fn;
}

function embedNotFound(el: HTMLElement, target: string) {
  el.classList.add('cm-embed-missing');
  setLocalizedText(el, "webobsidian.missing-file", {name:target}, "textContent", `«${target}» не может быть найдена.`);
}

class CanvasEmbedWidget extends WidgetType{
  constructor(readonly target:string,readonly origin:string,readonly kind:'wiki'|'markdown'='wiki'){super()}
  eq(other:CanvasEmbedWidget){return other.target===this.target&&other.origin===this.origin&&other.kind===this.kind}
  ignoreEvent(){return true}
  toDOM(){return createCanvasEmbed(this.target,this.origin,(target,origin,kind)=>openLink(target,kind,origin),this.kind)}
  destroy(dom:HTMLElement){destroyCanvasEmbed(dom)}
}
const noteEmbedCleanups=new WeakMap<HTMLElement,()=>void>();
class NoteEmbedWidget extends WidgetType {
  constructor(readonly target: string,readonly kind:'wiki'|'markdown'='wiki') {
    super();
  }
  eq(o: NoteEmbedWidget) {
    return o.target === this.target && o.kind===this.kind;
  }
  ignoreEvent() {
    return true;
  }
  toDOM() {
    const box = document.createElement('div');
    box.className = 'internal-embed markdown-embed cm-note-embed';
    const open = createNoteEmbedOpenButton(this.target,openLink,this.kind);
    // Filename title above the note content, like Obsidian's markdown-embed-title.
    const title = document.createElement('div');
    title.className = 'markdown-embed-title';
    title.textContent = (this.kind==='markdown'?decodeLinkTarget(this.target.split('#')[0]).replace(/\.(md|markdown)$/i,''):this.target.split('#')[0]).split('/').pop() ?? this.target;
    const content = document.createElement('div');
    content.className = 'markdown-embed-content markdown-preview';
    content.textContent = '…';
    box.append(open);
    if (!this.target.includes('#')) box.append(title);
    box.append(content);
    const origin=notePath;
    let destroyed=false,disposePdfs=()=>{},disposeCanvases=()=>{},disposeDiagrams=()=>{};
    noteEmbedCleanups.set(box,()=>{destroyed=true;disposePdfs();disposeCanvases();disposeDiagrams()});
    void noteEmbedProvider(this.target,this.kind).then((res) => {
      if(destroyed)return;
      if (!res) {
        content.remove();
        const at=this.target.indexOf('#'),fragment=at<0?'':this.target.slice(at+1),name=title.textContent||notePath.replace(/\.(md|markdown)$/i,'').split('/').pop()||'';
        if(fragment){setLocalizedText(title,"webobsidian.missing-fragment",{fragment,name},"textContent",`Не удалось найти «${fragment}» в ${name}`);box.append(title)}
        box.classList.add('is-unresolved');return;
      }
      content.innerHTML = res.html; // sanitized upstream (rehype-sanitize)
      content.dataset.embedSource=res.path??origin;
      addNoteEmbedOpenButtons(content,openLink);
      disposePdfs=mountPdfEmbeds(content,origin,(target,from,kind)=>{void (kind==='markdown'?useStore.getState().openWikilink(target,kind,from):useStore.getState().openAttachment(target,from))},(target,origin,kind)=>pdfFileActions(target,origin,{linkKind:kind}));
      disposeCanvases=mountCanvasEmbeds(content,origin,(target,from,kind)=>openLink(target,kind,from));
      disposeDiagrams=mountDiagramBlocks(content,res.path??origin);
      mountImageActions(content);
      content.addEventListener('mousedown', (e) => {
        const a = (e.target as HTMLElement).closest('[data-wikilink],a[data-link-kind="markdown"]') as HTMLAnchorElement | null;
        if (!a) return;
        e.preventDefault();
      });
      content.addEventListener('click', (e) => {
        const clicked=e.target as HTMLElement;
        if(clicked.closest('.pdf-reader'))return;
        if(clicked instanceof HTMLImageElement){
          e.preventDefault();e.stopPropagation();openLightbox(clicked.currentSrc||clicked.src,clicked.alt);return;
        }
        const a = clicked.closest('[data-wikilink],a[data-link-kind="markdown"]') as HTMLAnchorElement | null;
        if(!a)return;
        e.preventDefault();e.stopPropagation();
        const t = a.getAttribute('data-wikilink') ?? a.getAttribute('href');
        if (t) openLink(t, a.dataset.linkKind === 'markdown' ? 'markdown' : 'wiki',a.closest<HTMLElement>('[data-embed-source]')?.dataset.embedSource);
      });
    });
    return box;
  }
  destroy(dom:HTMLElement){noteEmbedCleanups.get(dom)?.();noteEmbedCleanups.delete(dom)}
}

/* ---------------- mermaid (lazy, like Obsidian) ---------------- */

const diagramCleanups=new WeakMap<HTMLElement,()=>void>();

class MermaidWidget extends WidgetType {
  constructor(readonly code: string,readonly source:SourceRange,readonly canEditSource:boolean) {
    super();
  }
  eq(o: MermaidWidget) {
    return o.code === this.code&&o.source.from===this.source.from&&o.source.to===this.source.to&&o.canEditSource===this.canEditSource;
  }
  ignoreEvent() {
    return true;
  }
  toDOM(view:EditorView) {
    const div = document.createElement('div');
    div.className = 'mermaid cm-mermaid';
    diagramCleanups.set(div,mountDiagram(div,this.code,{sourcePath:notePath,onRender:()=>{if(div.isConnected)view.requestMeasure()}}));
    if(this.canEditSource)addBlockSourceAction(div,view,this.source);
    return div;
  }
  destroy(dom:HTMLElement){diagramCleanups.get(dom)?.();diagramCleanups.delete(dom)}
}

function buildMermaid(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const open = line.text.match(/^\s*(`{3,}|~{3,})\s*mermaid\s*$/i);
    if (!open) continue;
    let end = -1;
    for (let j = n + 1; j <= doc.lines; j++) {
      if (doc.line(j).text.trim().startsWith(open[1][0].repeat(3))) {
        end = j;
        break;
      }
    }
    if (end < 0) continue;
    const from = line.from;
    const to = doc.line(end).to;
    const ro = state.field(livePreviewReadonly, false) ?? false;
    let touched = false;
    if (!ro)
      for (const r of state.selection.ranges) {
        if (r.from <= to && r.to >= from) {
          touched = true;
          break;
        }
      }
    if (!touched) {
      const code = end > n + 1 ? doc.sliceString(doc.line(n + 1).from, doc.line(end - 1).to) : '';
      ranges.push(Decoration.replace({ widget: new MermaidWidget(code,{from,to},!ro), block: true }).range(from, to));
    }
    n = end;
  }
  return Decoration.set(ranges, true);
}

export const mermaidField = StateField.define<DecorationSet>({
  create: (state) => buildMermaid(state),
  update(value, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setLivePreviewEnabled) || e.is(setLivePreviewReadonly))) {
      return buildMermaid(tr.state);
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---------------- ```html preview (Render HTML button) ---------------- */

/** Toggle the rendered state of the ```html block whose opening fence starts at
 *  the given position. Tracked in editor state so we can BOTH show the iframe and
 *  hide the source code block while rendered. */
export const toggleHtmlRender = StateEffect.define<number>();

/** Positions (opening-fence line starts) whose ```html block is rendered. */
export const htmlRenderedState = StateField.define<readonly number[]>({
  create: () => [],
  update(value, tr) {
    let v = tr.docChanged ? value.map((p) => tr.changes.mapPos(p, 1)) : [...value];
    for (const e of tr.effects) {
      if (e.is(toggleHtmlRender)) {
        v = v.includes(e.value) ? v.filter((x) => x !== e.value) : [...v, e.value];
      }
    }
    return v;
  },
});

/** "Render HTML" / "Hide HTML" toggle for a ```html fenced block. Collapsed it
 *  sits above the code (which stays visible); rendered it REPLACES the code block
 *  with a full-width sandboxed iframe (scripts run but isolated — no same-origin,
 *  so a saved page can't touch the vault/app). */
class HtmlPreviewWidget extends WidgetType {
  private onResize: (() => void) | null = null;
  constructor(readonly code: string, readonly key: number, readonly rendered: boolean) {
    super();
  }
  eq(o: HtmlPreviewWidget) {
    return o.key === this.key && o.rendered === this.rendered && o.code === this.code;
  }
  ignoreEvent() {
    return false;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-html-preview' + (this.rendered ? ' is-rendered' : '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-html-render-btn';
    btn.textContent = this.rendered ? uiText("webobsidian.hide-html-0fab51") : uiText("webobsidian.render-html-e2fc37");
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({ effects: toggleHtmlRender.of(this.key) });
    });
    wrap.appendChild(btn);
    if (this.rendered) {
      const frame = document.createElement('iframe');
      frame.className = 'cm-html-render-frame';
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals');
      frame.srcdoc = this.code;
      wrap.appendChild(frame);
      // Break out of the readable-line-width column to the full editor width.
      // (.is-rendered CSS centres on the scroller via left:50%/translateX; we just
      //  feed it the scroller's pixel width and keep it in sync on resize.)
      const sync = () => {
        wrap.style.width = view.scrollDOM.clientWidth + 'px';
      };
      requestAnimationFrame(sync);
      this.onResize = sync;
      window.addEventListener('resize', sync);
    }
    return wrap;
  }
  destroy() {
    if (this.onResize) window.removeEventListener('resize', this.onResize);
  }
}

function buildHtmlPreview(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const doc = state.doc;
  const renderedKeys = state.field(htmlRenderedState, false) ?? [];
  const ranges: Range<Decoration>[] = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const open = line.text.match(/^\s*(`{3,}|~{3,})\s*html\s*$/i);
    if (!open) continue;
    let end = -1;
    for (let j = n + 1; j <= doc.lines; j++) {
      if (doc.line(j).text.trim().startsWith(open[1][0].repeat(3))) {
        end = j;
        break;
      }
    }
    if (end < 0) continue;
    const key = line.from;
    const rendered = renderedKeys.includes(key);
    if (rendered) {
      // Replace the whole block — hides the source code AND shows the iframe.
      const code = end > n + 1 ? doc.sliceString(doc.line(n + 1).from, doc.line(end - 1).to) : '';
      const to = doc.line(end).to;
      ranges.push(
        Decoration.replace({ widget: new HtmlPreviewWidget(code, key, true), block: true }).range(line.from, to),
      );
    } else {
      // Button ABOVE the fence (side:-1) — html blocks can be huge (a whole saved
      // page), so a button after the block would sit off-screen and be unreachable.
      ranges.push(
        Decoration.widget({ widget: new HtmlPreviewWidget('', key, false), block: true, side: -1 }).range(line.from),
      );
    }
    n = end;
  }
  return Decoration.set(ranges, true);
}

export const htmlPreviewField = StateField.define<DecorationSet>({
  create: (state) => buildHtmlPreview(state),
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.effects.some((e) => e.is(setLivePreviewEnabled) || e.is(setLivePreviewReadonly) || e.is(toggleHtmlRender))
    ) {
      return buildHtmlPreview(tr.state);
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---------------- callout folding (`[!type]-` / `[!type]+`) ---------------- */

export const toggleCalloutFold = StateEffect.define<number>();

const QUOTE_LINE_RE = /^ {0,3}>/;
const QUOTE_MARKERS_RE = /^(?: {0,3}> ?)+/;

/**
 * Positions (title-line starts) whose fold state the user TOGGLED. The effective
 * state is `default(- = folded) XOR toggled`, so `[!x]-` callouts are folded by
 * default no matter when the document content arrives (async load, sync, …).
 */
export const calloutFoldState = StateField.define<readonly number[]>({
  create: () => [],
  update(value, tr) {
    let v = tr.docChanged ? value.map((p) => tr.changes.mapPos(p, 1)) : [...value];
    for (const e of tr.effects) {
      if (e.is(toggleCalloutFold)) {
        v = v.includes(e.value) ? v.filter((x) => x !== e.value) : [...v, e.value];
      }
    }
    return v;
  },
});

/** Effective fold state of the callout whose title line starts at `titleFrom`. */
function isCalloutFolded(state: EditorState, titleFrom: number, foldChar: string): boolean {
  const toggled = (state.field(calloutFoldState, false) ?? []).includes(titleFrom);
  return (foldChar === '-') !== toggled;
}

function quoteDepth(text: string): number {
  return (text.match(QUOTE_MARKERS_RE)?.[0].match(/>/g) ?? []).length;
}

function buildCalloutFolds(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const depth = quoteDepth(line.text);
    let node = syntaxTree(state).resolveInner(line.from + (line.text.match(QUOTE_MARKERS_RE)?.[0].length ?? 0), 1);
    let parsedQuote = false;
    while (node.parent) { if (node.name === 'Blockquote') parsedQuote = true; node = node.parent; }
    if (parsedQuote && depth && (n === 1 || quoteDepth(doc.line(n - 1).text) < depth)) {
      const cm = line.text.replace(QUOTE_MARKERS_RE, '').match(CALLOUT_RE);
      if (cm && cm[2] && isCalloutFolded(state, line.from, cm[2])) {
        let last = n;
        while (last < doc.lines && quoteDepth(doc.line(last + 1).text) >= depth) last++;
        if (last > n) {
          const to = doc.line(last).to;
          // reveal while the caret is inside the callout (never in readonly)
          const ro = state.field(livePreviewReadonly, false) ?? false;
          let touched = false;
          if (!ro)
            for (const r of state.selection.ranges) {
              if (r.from <= to && r.to >= line.from) {
                touched = true;
                break;
              }
            }
          if (!touched) ranges.push(Decoration.replace({ block: true, inclusiveStart:false }).range(line.to, to));
          n = last;
          continue;
        }
      }
    }
  }
  return Decoration.set(ranges, true);
}

export const calloutFoldDeco = StateField.define<DecorationSet>({
  create: (state) => buildCalloutFolds(state),
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.effects.some((e) => e.is(toggleCalloutFold) || e.is(setLivePreviewEnabled) || e.is(setLivePreviewReadonly))
    ) {
      return buildCalloutFolds(tr.state);
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---------------- tables ---------------- */

type Align = 'left' | 'center' | 'right' | null;
interface TableBlock {
  from: number;
  to: number;
  key: string;
  header: string[];
  align: Align[];
  rows: string[][];
  prefix: string;
  continuationPrefix: string;
}

function splitCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/(`+)([\s\S]*?)\1|\\\|/g,
    (token, ticks) => ticks ? token : '|').trim());
}

/** Find GFM/Obsidian tables in the doc: a header row, a delimiter row, then body rows. */
const commentCache = new WeakMap<Text, SourceRange[]>();
function documentComments(state: EditorState): SourceRange[] {
  let ranges = commentCache.get(state.doc);
  if (!ranges) {
    ranges = findObsidianComments(state.doc.toString());
    commentCache.set(state.doc, ranges);
  }
  return ranges;
}

const literalRangeCache=new WeakMap<Text,ReturnType<typeof markdownLiteralRanges>>();
function documentLiteralRanges(state:EditorState){let ranges=literalRangeCache.get(state.doc);if(!ranges){ranges=markdownLiteralRanges(state.doc.toString());literalRangeCache.set(state.doc,ranges)}return ranges}
const multilineCodeCache = new WeakMap<Text, (SourceRange & { size: number })[]>();
function liveMultilineCodeRanges(state: EditorState): (SourceRange & { size: number })[] {
  if (state.field(livePreviewReadonly, false)) return [];
  const cached = multilineCodeCache.get(state.doc);
  if (cached) return cached;
  const source = state.doc.toString();
  const literal=documentLiteralRanges(state),blocks:SourceRange[]=literal.filter(r=>r.kind==='code');
  const owned:SourceRange[]=[...documentComments(state),...literal.filter(r=>r.kind==='html')];
  const frontmatter=source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);if(frontmatter)owned.push({from:0,to:frontmatter[0].length});
  const ranges: (SourceRange & { size: number })[] = [];
  let opening: { from: number; size: number } | null = null;
  for (const token of source.matchAll(/`+/g)) {
    const from = token.index!, size = token[0].length;
    if (blocks.some(b => from >= b.from && from < b.to)) { opening = null; continue; }
    if (!opening) {
      if (!isEscaped(source, from) && !owned.some(r => from >= r.from && from < r.to)) opening = {from,size};
      continue;
    }
    if (size !== opening.size) continue;
    if (source.slice(opening.from, from).includes('\n') &&
        !blocks.some(b => b.from > opening!.from && b.from < from)) {
      ranges.push({from:opening.from,to:from+size,size});
    }
    opening = null;
  }
  multilineCodeCache.set(state.doc, ranges);
  return ranges;
}

function scanTables(state: EditorState): TableBlock[] {
  const doc = state.doc;
  const out: TableBlock[] = [];
  syntaxTree(state).iterate({ enter(ref) {
    if (ref.name !== 'Table' || [...documentComments(state), ...liveMultilineCodeRanges(state)].some(r => ref.from >= r.from && ref.from < r.to)) return;
    const table = ref.node;
    const header = table.getChild('TableHeader');
    const delimiter = table.getChild('TableDelimiter');
    if (!header || delimiter?.name !== 'TableDelimiter') return;
    const line = doc.lineAt(ref.from);
    const delimiterLine = doc.lineAt(delimiter.from);
    const prefix = doc.sliceString(line.from, ref.from);
    const continuationPrefix = doc.sliceString(delimiterLine.from, delimiter.from);
    const cells = (row: typeof table) => {
      // Lezer omits empty TableCell nodes. Delimiter boundaries retain their
      // column positions, including empty headers, without re-parsing escapes.
      const values: string[] = [];
      let start = row.from;
      const normalize = (raw: string) => raw.replace(/(`+)([\s\S]*?)\1|\\\|/g,
        (token, ticks) => ticks ? token : '|').trim();
      for (const delimiter of row.getChildren('TableDelimiter')) {
        if (delimiter.from !== row.from) values.push(normalize(doc.sliceString(start, delimiter.from)));
        start = delimiter.to;
      }
      const tail = doc.sliceString(start, row.to);
      if (tail.trim() || start === row.from) values.push(normalize(tail));
      return values;
    };
    const headerCells = cells(header);
    const align: Align[] = splitCells(doc.sliceString(delimiter.from, delimiter.to)).map(c =>
      c.startsWith(':') ? (c.endsWith(':') ? 'center' : 'left') : c.endsWith(':') ? 'right' : null);
    const rows = table.getChildren('TableRow').map(cells);
    out.push({ from: line.from, to: ref.to, header: headerCells, align, rows, prefix, continuationPrefix,
      key: JSON.stringify([prefix, continuationPrefix, headerCells, align, rows]) });
    return false;
  } });
  return out;
}

// Table cells use the same dialect and sanitizer as Preview/public output.
function appendInline(parent: HTMLElement, text: string) {
  const template = document.createElement('template');
  template.innerHTML = renderMarkdownBody(text, attachmentUrl);
  const paragraph = template.content.firstElementChild;
  if (paragraph?.tagName === 'P' && template.content.childElementCount === 1) {
    parent.append(...Array.from(paragraph.childNodes));
  } else parent.append(template.content);
  for (const code of parent.querySelectorAll('code')) code.classList.add('cm-code');
  for (const anchor of parent.querySelectorAll('a')) {
    anchor.onmousedown = e => {
      e.preventDefault();
      const target = anchor.dataset.wikilink ?? anchor.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(target)) window.open(target, '_blank', 'noopener');
      else if (target && !target.startsWith('#')) openLink(target, anchor.dataset.wikilink !== undefined ? 'wiki' : 'markdown');
    };
  }
}

const ALIGN_DELIM: Record<string, string> = { left: ':---', center: ':---:', right: '---:', '': '---' };

/** Serialize a table model back to GFM markdown. */
function serializeTable(header: string[], align: (Align | '')[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/(\\*)\|/g, (_match, slashes: string) =>
    slashes + (slashes.length % 2 === 0 ? '\\|' : '|')).replace(/\n/g, '<br>');
  const line = (cells: string[]) => `| ${cells.map(esc).join(' | ')} |`;
  const delim = `| ${align.map((a) => ALIGN_DELIM[a || '']).join(' | ')} |`;
  return [line(header), delim, ...rows.map(line)].join('\n');
}

/**
 * Obsidian-style interactive table editor: cells are click-to-edit, hover shows
 * +row / +column buttons, right-click opens a format menu (insert/delete/align).
 * Every mutation re-serializes the model and replaces the table's source range,
 * which makes `tableField` rebuild the widget — so the DOM is always in sync.
 */
class TableWidget extends WidgetType {
  /** `ro` = reading mode: render-only, no cell editing / handles / menus. */
  constructor(readonly block: TableBlock, readonly ro: boolean) {
    super();
  }
  eq(o: TableWidget) {
    return o.block.key === this.block.key && o.ro === this.ro;
  }
  ignoreEvent() {
    // We own all interaction (editing + controls); keep events from reaching CM.
    return true;
  }
  toDOM(view: EditorView) {
    const b = this.block;
    const cols = b.header.length;
    const wrap = document.createElement('div');
    wrap.className = 'cm-table-wrap';
    if (b.prefix.includes('>')) wrap.classList.add('cm-table-in-quote');
    else if (/\S/.test(b.prefix)) wrap.classList.add('cm-table-in-list');

    const table = document.createElement('table');
    table.className = 'cm-table';
    // Wide tables scroll inside their own box instead of being squeezed to the
    // line width (which broke cells mid-word). The scroller is a separate child
    // so the absolutely-positioned add-column/row controls on `wrap` aren't clipped.
    const scroll = document.createElement('div');
    scroll.className = 'cm-table-scroll';
    scroll.appendChild(table);
    wrap.appendChild(scroll);

    // Read the current (possibly edited) model straight from the DOM so that
    // uncommitted cell edits are never lost when a structural op fires.
    const readModel = () => {
      const ths = [...table.querySelectorAll('thead th')] as HTMLElement[];
      const header = ths.map((th) => th.dataset.raw ?? '');
      const align = ths.map((th) => (th.dataset.align ?? '') as Align | '');
      const rows = ([...table.querySelectorAll('tbody tr')] as HTMLElement[]).map((tr) =>
        ([...tr.children] as HTMLElement[]).map((td) => td.dataset.raw ?? ''),
      );
      return { header, align, rows };
    };
    const flushActive = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.dataset && el.classList.contains('cm-cell-edit')) el.dataset.raw = el.innerText;
    };
    const commit = (m: { header: string[]; align: (Align | '')[]; rows: string[][] }) => {
      view.dispatch({ changes: { from: b.from, to: b.to, insert: serializeTable(m.header, m.align, m.rows).split('\n').map((line, index) => (index ? b.continuationPrefix : b.prefix) + line).join('\n') } });
      view.focus();
    };
    const mutate = (fn: (m: { header: string[]; align: (Align | '')[]; rows: string[][] }) => void) => {
      flushActive();
      const m = readModel();
      fn(m);
      commit(m);
    };

    const setCellRendered = (cell: HTMLElement) => {
      cell.textContent = '';
      const raw = cell.dataset.raw ?? '';
      appendInline(cell, this.ro ? stripObsidianComments(raw) : raw);
    };
    const makeCell = (cell: HTMLElement, raw: string, col: number, rowIdx: number) => {
      cell.className = 'cm-cell-edit';
      cell.dataset.raw = raw;
      if (b.align[col]) {
        cell.style.textAlign = b.align[col]!;
        if (cell.tagName === 'TH') cell.dataset.align = b.align[col]!;
      } else if (cell.tagName === 'TH') {
        cell.dataset.align = '';
      }
      if (this.ro) {
        // reading mode: display only
        setCellRendered(cell);
        return;
      }
      cell.setAttribute('contenteditable', 'true');
      cell.spellcheck = false;
      setCellRendered(cell);
      cell.addEventListener('focus', () => {
        cell.textContent = cell.dataset.raw ?? '';
        const r = document.createRange();
        r.selectNodeContents(cell);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      });
      cell.addEventListener('blur', () => {
        const v = cell.innerText;
        if (v === cell.dataset.raw) {
          setCellRendered(cell);
          return;
        }
        cell.dataset.raw = v;
        mutate(() => {}); // model already reflects the edited data-raw
      });
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (cell as HTMLElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cell.textContent = cell.dataset.raw ?? '';
          setCellRendered(cell);
          (cell as HTMLElement).blur();
        }
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenu({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY, items: cellMenu(col, rowIdx) });
      });
    };

    // ---- structural operations (operate on the live model) ----
    const insertColumn = (at: number) =>
      mutate((m) => {
        m.header.splice(at, 0, '');
        m.align.splice(at, 0, '');
        m.rows.forEach((r) => r.splice(at, 0, ''));
      });
    const deleteColumn = (at: number) =>
      mutate((m) => {
        if (m.header.length <= 1) return;
        m.header.splice(at, 1);
        m.align.splice(at, 1);
        m.rows.forEach((r) => r.splice(at, 1));
      });
    const insertRow = (at: number) => mutate((m) => m.rows.splice(at, 0, new Array(m.header.length).fill('')));
    const deleteRow = (at: number) => mutate((m) => m.rows.splice(at, 1));
    const setAlign = (col: number, a: Align | '') => mutate((m) => (m.align[col] = a));
    const moveColumn = (from: number, to: number) =>
      mutate((m) => {
        if (to < 0 || to >= m.header.length) return;
        const mv = <T,>(a: T[]) => a.splice(to, 0, a.splice(from, 1)[0]);
        mv(m.header);
        mv(m.align);
        m.rows.forEach(mv);
      });
    const moveRow = (from: number, to: number) =>
      mutate((m) => {
        if (to < 0 || to >= m.rows.length) return;
        m.rows.splice(to, 0, m.rows.splice(from, 1)[0]);
      });

    // rowIdx: -1 for header row, otherwise body row index.
    const cellMenu = (col: number, rowIdx: number): LpMenuItem[] => [
      { get label() {return uiText("webobsidian.insert-column-left-ef42ff");}, icon: 'plus', onClick: () => insertColumn(col) },
      { get label() {return uiText("webobsidian.insert-column-right-d39b92");}, icon: 'plus', onClick: () => insertColumn(col + 1) },
      { get label() {return uiText("webobsidian.insert-row-above-506ad5");}, icon: 'plus', onClick: () => insertRow(Math.max(0, rowIdx)) },
      { get label() {return uiText("webobsidian.insert-row-below-168f7d");}, icon: 'plus', onClick: () => insertRow(rowIdx + 1) },
      { label: '', separator: true },
      { get label() {return uiText("table.action-column-left");}, onClick: () => moveColumn(col, col - 1) },
      { get label() {return uiText("table.action-column-right");}, onClick: () => moveColumn(col, col + 1) },
      ...(rowIdx >= 0
        ? [
            { get label() {return uiText("table.action-row-up");}, onClick: () => moveRow(rowIdx, rowIdx - 1) },
            { get label() {return uiText("table.action-row-down");}, onClick: () => moveRow(rowIdx, rowIdx + 1) },
          ]
        : []),
      { label: '', separator: true },
      {
        get label() {return uiText("webobsidian.align-column-a52f38");},
        icon: 'align-left',
        submenu: [
          { get label() {return uiText("webobsidian.left-8ae1c3");}, icon: 'align-left', onClick: () => setAlign(col, 'left') },
          { get label() {return uiText("webobsidian.center-a23911");}, icon: 'align-center', onClick: () => setAlign(col, 'center') },
          { get label() {return uiText("webobsidian.right-954daa");}, icon: 'align-right', onClick: () => setAlign(col, 'right') },
        ],
      },
      { label: '', separator: true },
      { get label() {return uiText("table.action-delete-column");}, icon: 'trash-2', onClick: () => deleteColumn(col) },
      ...(rowIdx >= 0 ? [{ get label() {return uiText("table.action-delete-row");}, icon: 'trash-2', onClick: () => deleteRow(rowIdx) }] : []),
    ];

    // ---- build header + body ----
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      makeCell(th, b.header[c] ?? '', c, -1);
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    b.rows.forEach((row, ri) => {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        makeCell(td, row[c] ?? '', c, ri);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Reading mode: no handles / add buttons / menus — table is display-only.
    if (this.ro) return wrap;

    // ---- row / column select handles (hover-highlight + open the format menu) ----
    const highlightCol = (c: number, on: boolean) => {
      for (const tr of table.querySelectorAll('tr')) (tr.children[c] as HTMLElement)?.classList.toggle('cm-cell-hl', on);
    };
    const highlightRow = (tr: HTMLElement, on: boolean) => {
      for (const cell of tr.children) (cell as HTMLElement).classList.toggle('cm-cell-hl', on);
    };
    ([...thead.querySelectorAll('th')] as HTMLElement[]).forEach((th, c) => {
      const h = document.createElement('div');
      h.className = 'cm-col-handle';
      h.contentEditable = 'false';
      setLocalizedText(h, "webobsidian.select-format-column-b6b1d2", {}, "title");
      h.addEventListener('mouseenter', () => highlightCol(c, true));
      h.addEventListener('mouseleave', () => highlightCol(c, false));
      h.addEventListener('mousedown', (e) => {
        e.preventDefault();
        highlightCol(c, false);
        openMenu({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY, items: cellMenu(c, -1) });
      });
      th.appendChild(h);
    });
    ([...tbody.querySelectorAll('tr')] as HTMLElement[]).forEach((tr, ri) => {
      const first = tr.children[0] as HTMLElement | undefined;
      if (!first) return;
      const h = document.createElement('div');
      h.className = 'cm-row-handle';
      h.contentEditable = 'false';
      setLocalizedText(h, "webobsidian.select-format-row-9d74cf", {}, "title");
      h.addEventListener('mouseenter', () => highlightRow(tr, true));
      h.addEventListener('mouseleave', () => highlightRow(tr, false));
      h.addEventListener('mousedown', (e) => {
        e.preventDefault();
        highlightRow(tr, false);
        openMenu({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY, items: cellMenu(0, ri) });
      });
      first.appendChild(h);
    });

    // ---- hover +column / +row buttons (mousedown so a focused cell flushes) ----
    const addCol = document.createElement('div');
    addCol.className = 'cm-table-addcol';
    setLocalizedText(addCol, "webobsidian.add-column-e77ea6", {}, "title");
    addCol.textContent = '+';
    addCol.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertColumn(cols);
    });
    const addRow = document.createElement('div');
    addRow.className = 'cm-table-addrow';
    setLocalizedText(addRow, "webobsidian.add-row-f648af", {}, "title");
    addRow.textContent = '+';
    addRow.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertRow(b.rows.length);
    });
    wrap.append(addCol, addRow);
    return wrap;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-bullet';
    s.textContent = '•';
    return s;
  }
}

/* ---------------- raw HTML blocks ---------------- */

// Markdown HTML tag names contain letters, digits and hyphens. Lezer also
// accepts underscores, but placeholders such as <LS_BEN> must stay literal.
const HTML_TAG_START_RE = /^ {0,3}<\/?[a-zA-Z][a-zA-Z0-9-]*(?=[\s/>]|$)/;

// Strip scripts/handlers/dangerous URLs from raw note HTML before rendering it
// inline (Obsidian renders embedded HTML, e.g. CKEditor/Trilium tables, the same).
function sanitizeHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = renderPreparedMarkdown(preserveLiteralTags(html));
  const paragraph = template.content.firstElementChild;
  return paragraph?.tagName === 'P' && template.content.childElementCount === 1
    ? paragraph.innerHTML : template.innerHTML;
}

class HtmlBlockWidget extends WidgetType {
  constructor(readonly html: string, readonly inline = false) {
    super();
  }
  eq(o: HtmlBlockWidget) {
    return o.html === this.html && o.inline === this.inline;
  }
  toDOM() {
    const div = document.createElement(this.inline ? 'span' : 'div');
    div.className = this.inline ? 'cm-html-inline' : 'cm-html-block';
    div.innerHTML = sanitizeHtml(this.html);
    div.addEventListener('mousedown', (e) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener');
      else if (href && !href.startsWith('#')) openLink(href, 'markdown');
    });
    return div;
  }
  ignoreEvent(event: Event) {
    // Pointer/focus events in a web frame belong to its document, not the editor.
    return event.target instanceof Element && !!event.target.closest('iframe.web-embed');
  }
}

/** Locate raw HTML blocks (whole-line ranges) via the markdown syntax tree. */
function scanHtmlBlocks(state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const doc = state.doc;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'HTMLBlock') return;
      if ([...documentComments(state), ...liveMultilineCodeRanges(state)].some(r => node.from >= r.from && node.from < r.to)) return;
      const fromLine = doc.lineAt(node.from);
      const opener = doc.sliceString(node.from, fromLine.to);
      if (/^<\/?[a-zA-Z]/.test(opener) && !HTML_TAG_START_RE.test(opener)) return;
      const toLine = doc.lineAt(Math.max(node.from, Math.min(node.to, doc.length) - 1));
      out.push({ from: fromLine.from, to: toLine.to });
    },
  });
  return out;
}

/** Matched inline HTML owns only its source range, never surrounding text. */
function scanInlineHtml(state: EditorState): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  const stack: { name: string; from: number; line: number; color: boolean }[] = [];
  syntaxTree(state).iterate({ enter(node) {
    if (node.name !== 'HTMLTag') return;
    const raw = state.doc.sliceString(node.from, node.to);
    const tag = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)(?=[\s/>])/.exec(raw);
    if (!tag) return false;
    const line = state.doc.lineAt(node.from).number;
    if (stack.length && stack[0].line !== line) stack.length = 0;
    const name = tag[1].toLowerCase();
    if (raw.startsWith('</')) {
      const open = stack.at(-1);
      if (open?.name !== name) return false;
      stack.pop();
      if (!stack.length && !open.color && state.doc.lineAt(node.to).number === line) {
        ranges.push({ from: open.from, to: node.to });
      }
    } else if (/\/>$/.test(raw) || /^(br|img|hr|input|wbr|source|area|base|col|embed|link|meta|param|track)$/.test(name)) {
      if (!stack.length) ranges.push({ from: node.from, to: node.to });
    } else {
      const style = raw.match(/^<span style="([^"]+)">$/)?.[1];
      stack.push({ name, from: node.from, line, color: !!style && COLOR_STYLE_RE.test(style) });
    }
    return false;
  } });
  return ranges;
}

interface Prop {
  key: string;
  values: string[];
  list: boolean;
}

const stripQuotes = (s: string) => s.replace(/^["'](.*)["']$/, '$1');

// Tags / cssclasses can't contain spaces (invalid in Obsidian) — collapse runs of
// whitespace to a hyphen and drop a leading '#'. Other list values pass through.
function sanitizeListValue(key: string, raw: string): string {
  const v = raw.trim();
  if (key === 'tags' || key === 'cssclasses') return v.replace(/^#+/, '').replace(/\s+/g, '-');
  return v;
}

/** Parse the YAML subset Obsidian uses for properties. */
function parseFrontmatter(yaml: string): Prop[] {
  const props: Prop[] = [];
  let cur: Prop | null = null;
  for (const line of yaml.split('\n')) {
    const kv = line.match(/^([\w .-]+?):\s*(.*)$/);
    const li = line.match(/^\s*-\s+(.+)$/);
    if (li && cur) {
      cur.list = true;
      cur.values.push(stripQuotes(li[1].trim()));
    } else if (kv) {
      cur = { key: kv[1].trim(), values: [], list: CORE_LIST_PROPS.has(kv[1].trim()) };
      const val = kv[2].trim();
      if (val) {
        const arr = val.match(/^\[(.*)\]$/);
        if (arr) {
          cur.list = true;
          cur.values = arr[1].split(',').map((s) => stripQuotes(s.trim())).filter(Boolean);
        } else {
          cur.values = [stripQuotes(val)];
        }
      }
      props.push(cur);
    }
  }
  return props;
}

const yamlNeedsQuote = (s: string) =>
  s === '' || /^[\s>|*&!?@`"'[\]{}#,-]/.test(s) || /:\s/.test(s) || /[:#]$/.test(s) || /\s$/.test(s);
const yamlQuote = (s: string) => (yamlNeedsQuote(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

/** Serialize properties back to the inner YAML (without the `---` fences). */
function serializeFrontmatter(props: Prop[]): string {
  const lines: string[] = [];
  for (const p of props) {
    if (!p.key) continue;
    if (p.list) {
      lines.push(`${p.key}:`);
      for (const v of p.values.filter((x) => x !== '')) lines.push(`  - ${yamlQuote(v)}`);
    } else {
      const v = p.values[0] ?? '';
      lines.push(v === '' ? `${p.key}:` : `${p.key}: ${yamlQuote(v)}`);
    }
  }
  return lines.join('\n');
}

// Obsidian's built-in List properties.
const CORE_LIST_PROPS = new Set(['tags', 'aliases', 'cssclasses']);

// Property type → small glyph for the leading icon (display only, like Obsidian).
function propType(p: Prop): string {
  if (p.list || CORE_LIST_PROPS.has(p.key)) return 'list';
  const v = p.values[0] ?? '';
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return 'datetime';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
  if (v !== '' && /^-?\d+(\.\d+)?$/.test(v)) return 'number';
  if (/^(true|false)$/i.test(v)) return 'checkbox';
  return 'text';
}
const TYPE_GLYPH: Record<string, string> = {
  text: 'T',
  list: '≣',
  date: '🗓',
  datetime: '🕒',
  number: '#',
  checkbox: '☑',
};

// Obsidian type id ↔ our display type.
const OBS_TO_DT: Record<string, string> = {
  text: 'text',
  multitext: 'list',
  tags: 'list',
  aliases: 'list',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  datetime: 'datetime',
};
function dtToObs(dt: string, key: string): string {
  if (dt === 'list') return key === 'tags' ? 'tags' : key === 'aliases' ? 'aliases' : 'multitext';
  return dt;
}
/** Effective display type: the vault registry wins, else inferred from the value. */
function displayTypeOf(p: Prop): string {
  const reg = propTypeRegistry[p.key];
  if (reg && OBS_TO_DT[reg]) return OBS_TO_DT[reg];
  return propType(p);
}
// The six selectable types shown in the right-click "Property type" submenu.
const PROP_TYPE_OPTIONS: { label: string; dt: string }[] = [
  { get label() {return uiText("properties.types.option-text");}, dt: 'text' },
  { get label() {return uiText("webobsidian.list-a1fffa");}, dt: 'list' },
  { get label() {return uiText("webobsidian.number-b7baa1");}, dt: 'number' },
  { get label() {return uiText("properties.types.option-checkbox");}, dt: 'checkbox' },
  { get label() {return uiText("properties.types.option-date");}, dt: 'date' },
  { get label() {return uiText("properties.types.option-datetime");}, dt: 'datetime' },
];

class FrontmatterWidget extends WidgetType {
  /** `ro` = reading mode: display-only properties. */
  constructor(readonly yaml: string, readonly ro: boolean) {
    super();
  }
  eq(o: FrontmatterWidget) {
    return o.yaml === this.yaml && o.ro === this.ro;
  }
  ignoreEvent() {
    return true;
  }
  toDOM(view: EditorView) {
    // `shell` is the box CodeMirror measures, so the widget's vertical spacing lives
    // on it as PADDING: the height oracle only ever sees border-box rects, and space
    // contributed by a vertical `margin` here would be invisible to it — every click
    // below the properties block then resolved one line too low.
    const shell = document.createElement('div');
    shell.className = 'cm-properties';
    const box = document.createElement('div');
    box.className = 'properties';
    shell.appendChild(box);

    // Re-find the current frontmatter range and replace it with fresh YAML.
    const commit = (props: Prop[]) => {
      const inner = serializeFrontmatter(props);
      const text = view.state.doc.sliceString(0, Math.min(view.state.doc.length, 8000));
      const fm = text.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
      if (fm) {
        const end = fm[0].length;
        const blockEnd = text[end - 1] === '\n' ? end - 1 : end;
        view.dispatch({ changes: { from: 0, to: blockEnd, insert: `---\n${inner}\n---` } });
      } else {
        view.dispatch({ changes: { from: 0, to: 0, insert: `---\n${inner}\n---\n` } });
      }
      view.focus();
    };
    const readProps = (): Prop[] =>
      ([...box.querySelectorAll('.prop-row:not(.prop-newrow)')] as HTMLElement[]).map((row) => ({
        key: (row.querySelector('.prop-key') as HTMLElement).innerText.trim(),
        list: row.dataset.list === '1',
        values:
          row.dataset.list === '1'
            ? ([...row.querySelectorAll('.prop-pill')] as HTMLElement[]).map((p) => p.dataset.val ?? '')
            : [(row.querySelector('.prop-val-field') as HTMLElement)?.dataset.raw ?? ''],
      }));
    // Flush an in-progress inline edit (pill text or scalar text) into its data
    // attribute so a concurrent structural change never drops it.
    const flushActive = () => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return;
      if (a.classList.contains('prop-pill-text')) {
        const pill = a.closest('.prop-pill') as HTMLElement | null;
        const rowKey = (a.closest('.prop-row')?.querySelector('.prop-key') as HTMLElement | null)?.innerText.trim() ?? '';
        if (pill) pill.dataset.val = sanitizeListValue(rowKey, a.innerText);
      } else if (a.classList.contains('prop-val-input')) {
        a.dataset.raw = a.innerText;
      }
    };
    const mutate = (fn: (p: Prop[]) => void) => {
      flushActive();
      const p = readProps();
      fn(p);
      commit(p);
    };

    // Change a property's type: persist to .obsidian/types.json, then convert the
    // note's YAML if list-ness changed (else just refresh the icon in place).
    // A page's own `type` decides which status vocabulary applies (FR-23): a task's statuses are
    // not an abnormality's. Read from the block's YAML so the rows and setType agree.
    const pageKind = () => {
      const rows = parseFrontmatter(this.yaml);
      return (rows.find((p) => p.key.trim().toLowerCase() === 'type')?.values[0] ?? '').trim();
    };

    const setType = async (key: string, dt: string) => {
      try {
        const types = await persistPropertyType(key, dtToObs(dt, key));
        setLivePreviewPropertyTypes(types);
      } catch {
        /* keep going with local change */
      }
      const row = ([...box.querySelectorAll('.prop-row:not(.prop-newrow)')] as HTMLElement[]).find(
        (r) => (r.querySelector('.prop-key') as HTMLElement).innerText.trim() === key,
      );
      const curIsList = row?.dataset.list === '1';
      const newIsList = dt === 'list';
      if (newIsList !== curIsList) {
        mutate((ps) => {
          const p = ps.find((x) => x.key === key);
          if (!p) return;
          if (newIsList) p.list = true;
          else {
            p.list = false;
            p.values = [p.values.filter(Boolean).join(', ')];
          }
        });
      } else if (row) {
        // Scalar → scalar: no YAML change needed; just refresh the icon and swap
        // the value control to match the new type (e.g. date → number input).
        const ic = row.querySelector('.prop-icon') as HTMLElement | null;
        if (ic) {
          ic.innerHTML = propertyIconSvg(dt,key);
          row.dataset.propType=dt;
          ic.title = dt;
        }
        const valCell = row.querySelector('.prop-val');
        const oldField = row.querySelector('.prop-val-field') as HTMLElement | null;
        if (valCell && oldField) {
          // Rebuild the cell's single control rather than swapping the field in place: a
          // pick-list field (FR-23) sits inside its own wrapper alongside the ▾ button.
          const fresh = makeScalarField(dt, oldField.dataset.raw ?? '', key, pageKind());
          valCell.textContent = '';
          valCell.appendChild(fresh);
        }
      }
    };

    const propMenu = (key: string, idx: number, curDt: string): LpMenuItem[] => [
      {
        get label() {return uiText("webobsidian.property-type-8ad7ea");},
        icon: 'list',
        submenu: PROP_TYPE_OPTIONS.map((o) => ({
          label: (o.dt === curDt ? '✓  ' : '  ') + o.label,
          onClick: () => void setType(key, o.dt),
        })),
      },
      { label: '', separator: true },
      {
        get label() {return uiText("webobsidian.copy-value-4c924d");},
        icon: 'file-text',
        onClick: () => {
          const p = readProps()[idx];
          if (p) navigator.clipboard.writeText(p.values.join(', ')).catch(() => {});
        },
      },
      { label: '', separator: true },
      { get label() {return uiText("webobsidian.remove-e96390");}, icon: 'trash-2', onClick: () => mutate((ps) => ps.splice(idx, 1)) },
    ];

    const props = parseFrontmatter(this.yaml);

    const header = document.createElement('div');
    header.className = 'cm-props-header';
    const ru=/^ru(?:-|$)/i.test(navigator.language);
    setLocalizedText(header,"webobsidian.properties-bc6c88",{},"textContent","Свойства");
    header.setAttribute('role','button');header.tabIndex=0;header.setAttribute('aria-expanded','true');
    const toggleProperties=()=>{const collapsed=box.classList.toggle('is-collapsed');header.setAttribute('aria-expanded',String(!collapsed));view.requestMeasure()};
    header.onclick=toggleProperties;header.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleProperties()}};
    box.appendChild(header);

    const editable = (el: HTMLElement, onCommit: () => void) => {
      if (this.ro) return; // reading mode: no inline editing
      el.setAttribute('contenteditable', 'true');
      el.spellcheck = false;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          el.blur();
        }
      });
      el.addEventListener('blur', onCommit);
    };

    // The value list for a closed-vocabulary property (FR-23): a ▾ beside the field that opens
    // the vault's values. Same popup host and classes as the list-item suggester, so the theme
    // wrapper's palette resolves; picking writes the frontmatter through mutate() like any edit.
    const pickButton = (key: string, field: HTMLElement, opts: PropOption[]): HTMLElement => {
      const btn = document.createElement('span');
      btn.className = 'prop-pick-btn';
      btn.textContent = '▾';
      setLocalizedText(btn, "webobsidian.choose-a-value0-7f4d9e", {value0: key}, "title");
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', `Choose a ${key} value`);
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        openPickList(field, opts);
      });
      return btn;
    };

    const openPickList = (field: HTMLElement, opts: PropOption[]) => {
      const dd = document.createElement('div');
      dd.className = 'cm-props-dropdown prop-val-dropdown';
      dd.setAttribute('role', 'listbox');
      themedPopupHost().appendChild(dd);
      // Fixed-position just below the field (viewport coords; rect forces reflow).
      const r = field.getBoundingClientRect();
      dd.style.left = `${Math.round(r.left)}px`;
      dd.style.top = `${Math.round(r.bottom + 2)}px`;

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        dd.remove();
        window.removeEventListener('mousedown', away, true);
        window.removeEventListener('keydown', escape, true);
      };
      const pick = (value: string) => {
        close();
        // The DOM field is the source readProps reads: set both, then commit once.
        field.textContent = value;
        field.dataset.raw = value;
        mutate(() => {});
      };
      const away = (e: MouseEvent) => {
        if (!dd.contains(e.target as Node)) close();
      };
      const escape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
      };
      window.addEventListener('mousedown', away, true);
      window.addEventListener('keydown', escape, true);

      for (const o of opts) {
        const it = document.createElement('div');
        it.className = 'cm-props-dd-item' + (o.offList ? ' is-offlist' : '');
        it.dataset.value = o.value;
        it.setAttribute('role', 'option');
        it.setAttribute('aria-selected', o.current ? 'true' : 'false');
        const ic = document.createElement('span');
        ic.className = 'prop-icon';
        ic.textContent = o.current ? '✓' : '';
        const nm = document.createElement('span');
        nm.textContent = o.value;
        it.append(ic, nm);
        if (o.offList) {
          // In the note but not in SCHEMA: shown, never rewritten, and labelled as such.
          const hint = document.createElement('span');
          hint.className = 'prop-val-offlist';
          setLocalizedText(hint, "webobsidian.in-this-note-daf5dc", {}, "textContent");
          it.appendChild(hint);
        }
        it.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pick(o.value);
        });
        dd.appendChild(it);
      }
    };

    // A value editor whose control matches the property type. `dataset.raw` always
    // holds the canonical YAML value so readProps never rewrites untouched fields.
    const makeScalarField = (dt: string, value: string, key: string, type: string): HTMLElement => {
      const commitChange = () => mutate(() => {});
      if (dt === 'number') {
        const inp = document.createElement('input');
        inp.type = 'number';inp.disabled=this.ro;
        inp.className = 'prop-val-field prop-input';
        inp.value = value;
        inp.dataset.raw = value;
        inp.addEventListener('change', () => {
          inp.dataset.raw = inp.value;
          commitChange();
        });
        return inp;
      }
      if (dt === 'checkbox') {
        const inp = document.createElement('input');
        inp.type = 'checkbox';inp.disabled=this.ro;
        inp.className = 'prop-val-field prop-checkbox';
        const on = /^(true|yes|1)$/i.test(value);
        inp.checked = on;
        inp.dataset.raw = on ? 'true' : 'false';
        inp.addEventListener('change', () => {
          inp.dataset.raw = inp.checked ? 'true' : 'false';
          commitChange();
        });
        return inp;
      }
      if (dt === 'date' || dt === 'datetime') {
        const inp = document.createElement('input');
        inp.type = dt === 'date' ? 'date' : 'datetime-local';inp.disabled=this.ro;
        inp.className = 'prop-val-field prop-input';
        if (dt === 'date') {
          inp.value = value.slice(0, 10);
        } else {
          const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
          inp.value = m ? `${m[1]}T${m[2]}` : '';
        }
        inp.dataset.raw = value;
        inp.addEventListener('change', () => {
          inp.dataset.raw = inp.value;
          commitChange();
        });
        const wrap=document.createElement('span');wrap.className='prop-date-wrap';
        const calendar=document.createElement('button');calendar.type='button';calendar.className='prop-date-calendar';calendar.innerHTML=propertyIconSvg(dt);setLocalizedText(calendar,'webobsidian.choose-date',{},'aria-label','Выбрать дату');calendar.disabled=this.ro;
        calendar.onclick=e=>{e.preventDefault();try{inp.showPicker()}catch{inp.focus()}};
        const link=document.createElement('button');link.type='button';link.className='prop-date-link';link.innerHTML=propertyIconSvg('link');setLocalizedText(link,'webobsidian.open-date-note',{},'aria-label','Открыть заметку даты');link.onclick=e=>{e.preventDefault();if(inp.value)openLink(inp.value.slice(0,10))};
        wrap.append(calendar,inp,link);return wrap;
      }
      // text (default)
      const span = document.createElement('span');
      span.className = 'prop-val-field prop-val-input';
      span.dataset.raw = value;
      span.textContent = value;
      editable(span, () => {
        if (span.innerText !== span.dataset.raw) {
          span.dataset.raw = span.innerText;
          mutate(() => {});
        }
      });
      // Closed-vocabulary keys get the vault's values as a list to pick from (FR-23). The
      // field stays editable text: SCHEMA owns the vocabulary, the picker only saves typing
      // an id from memory, and a value it does not know is still shown and still writable.
      const opts = this.ro ? null : optionsFor(key, value, type);
      if (!opts) return span;
      const wrap = document.createElement('span');
      wrap.className = 'prop-val-wrap';
      wrap.append(span, pickButton(key, span, opts));
      return wrap;
    };

    // Add an item to a list property via a typed input + suggestion dropdown
    // (vault tags for the `tags` property; free text otherwise), like Obsidian.
    const startAddItem = async (key: string, idx: number, container: HTMLElement, addBtn: HTMLElement) => {
      if(container.querySelector('.prop-pill-input'))return;
      addBtn.style.display = 'none';
      const inp = document.createElement('span');
      inp.className = 'prop-pill-input';
      inp.setAttribute('contenteditable', 'true');
      inp.spellcheck = false;
      const dd = document.createElement('div');
      dd.className = 'cm-props-dropdown prop-val-dropdown';
      container.insertBefore(inp, addBtn);
      // Mount inside the theme wrapper (not <body>) so the CSS variables that give
      // the dropdown its background resolve — otherwise it renders transparent.
      themedPopupHost().appendChild(dd);
      // Fixed-position just below the input (viewport coords; rect forces reflow).
      const ir = inp.getBoundingClientRect();
      dd.style.left = `${Math.round(ir.left)}px`;
      dd.style.top = `${Math.round(ir.bottom + 2)}px`;
      inp.focus();

      const suggestions = key === 'tags' ? await tagProvider() : [];
      const existing = new Set(([...container.querySelectorAll('.prop-pill')] as HTMLElement[]).map((p) => p.dataset.val));
      let done = false;
      const cleanup = () => {
        if (container.contains(inp)) inp.remove();
        dd.remove();
        addBtn.style.display = '';
      };
      const choose = (val: string) => {
        if (done) return;
        done = true;
        const vv = sanitizeListValue(key, val);
        // Always tear down first: the dropdown is mounted on the theme wrapper
        // (outside the widget DOM), so mutate()'s rebuild won't remove it — skip
        // this and the suggester stays stuck on screen after picking a value.
        cleanup();
        if (!vv) return;
        mutate((ps) => ps[idx]?.values.push(vv));
      };
      const render = () => {
        const q = inp.innerText.trim().toLowerCase();
        const matches = suggestions.filter((s) => !existing.has(s) && s.toLowerCase().includes(q));
        dd.textContent = '';
        for (const s of matches) {
          const it = document.createElement('div');
          it.className = 'cm-props-dd-item';
          const ic = document.createElement('span');
          ic.className = 'prop-icon';
          ic.textContent = '#';
          const nm = document.createElement('span');
          nm.textContent = s;
          it.append(ic, nm);
          it.addEventListener('mousedown', (e) => {
            e.preventDefault();
            choose(s);
          });
          dd.appendChild(it);
        }
        dd.style.display = matches.length ? 'block' : 'none';
      };
      render();
      inp.addEventListener('input', render);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          choose(inp.innerText);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done = true;
          cleanup();
        }
      });
      inp.addEventListener('blur', () =>
        setTimeout(() => {
          if (!done) {
            if (inp.innerText.trim()) choose(inp.innerText);
            else cleanup();
          }
        }, 160),
      );
    };

    const pageType = pageKind();
    props.forEach((p, idx) => {
      const dt = displayTypeOf(p);
      const renderAsList = dt === 'list' || p.list;
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.dataset.list = renderAsList ? '1' : '0';

      const icon = document.createElement('span');
      icon.className = 'prop-icon';
      icon.innerHTML = propertyIconSvg(renderAsList ? 'list' : dt,p.key);
      row.dataset.propertyKey=p.key;row.dataset.propType=renderAsList?'list':dt;
      icon.title = renderAsList ? uiText("webobsidian.list-38b62b") : dt;

      const k = document.createElement('span');
      k.className = 'prop-key';
      k.textContent = p.key;
      editable(k, () => mutate(() => {}));

      // Right-click the key or icon → Property type / Copy / Remove (like Obsidian).
      const openPropMenu = (e: MouseEvent) => {
        if (this.ro) return;
        e.preventDefault();
        e.stopPropagation();
        openMenu({ x: e.clientX, y: e.clientY, items: propMenu(p.key, idx, renderAsList ? 'list' : dt) });
      };
      k.addEventListener('contextmenu', openPropMenu);
      icon.addEventListener('contextmenu', openPropMenu);
      icon.style.cursor = 'pointer';
      // Left-click the icon also opens the menu. Use `click` (not `mousedown`):
      // openPropMenu stops propagation, so the trailing click never reaches the
      // window close-listener — opening on mousedown let that click slam it shut
      // again (the "jitter / won't open" on left-click).
      icon.addEventListener('click', openPropMenu);

      const v = document.createElement('div');
      v.className = 'prop-val';
      if (renderAsList) {
        for (const val of p.values) {
          const pill = document.createElement('span');
          pill.className = 'prop-pill';
          pill.dataset.val = val;
          const txt = document.createElement('span');
          txt.className = 'prop-pill-text';
          txt.textContent = val;
          if(!this.ro)txt.setAttribute('contenteditable', 'true');
          txt.spellcheck = false;
          txt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              txt.blur();
            }
          });
          txt.addEventListener('blur', () => {
            const nv = sanitizeListValue(p.key, txt.innerText);
            if (nv !== pill.dataset.val) {
              pill.dataset.val = nv;
              txt.textContent = nv; // reflect the sanitized value
              mutate(() => {});
            } else if (txt.innerText !== nv) {
              txt.textContent = nv;
            }
          });
          const x = document.createElement('span');
          x.className = 'prop-pill-x';
          x.innerHTML=propertyIconSvg('close');x.setAttribute('role','button');setLocalizedText(x,'webobsidian.remove-value',{},'aria-label','Удалить значение');
          x.addEventListener('mousedown', (e) => {
            e.preventDefault();
            mutate((ps) => {
              const pp = ps[idx];
              if (!pp) return;
              const i = pp.values.indexOf(pill.dataset.val ?? '');
              if (i >= 0) pp.values.splice(i, 1);
            });
          });
          pill.append(txt, x);
          v.appendChild(pill);
        }
        const add = document.createElement('span');
        add.className = 'prop-pill-add';
        add.textContent = '';add.tabIndex=0;add.setAttribute('role','button');setLocalizedText(add,'webobsidian.add-item',{},'aria-label','Добавить значение');
        setLocalizedText(add, "plugins.bases.command-add-item", {}, "title");
        add.addEventListener('mousedown', (e) => {
          e.preventDefault();
          void startAddItem(p.key, idx, v, add);
        });
        v.appendChild(add);
        if(!this.ro){v.addEventListener('mousedown',e=>{if(e.target===v){e.preventDefault();void startAddItem(p.key,idx,v,add)}});add.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void startAddItem(p.key,idx,v,add)}}}
      } else {
        v.appendChild(makeScalarField(dt, p.values[0] ?? '', p.key, pageType));
      }

      const del = document.createElement('span');
      del.className = 'prop-del';
      del.textContent = '×';
      setLocalizedText(del, "plugins.properties.opt-delete-properties", {}, "title");
      del.addEventListener('mousedown', (e) => {
        e.preventDefault();
        mutate((ps) => ps.splice(idx, 1));
      });

      row.append(icon, k, v, del);
      box.appendChild(row);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'cm-props-add';
    setLocalizedText(addBtn,"webobsidian.-add-property-e2852e",{},"textContent","+ Добавить свойство");

    // Add a property with a name-suggester dropdown (existing vault keys), like Obsidian.
    const startAdd = async () => {
      addBtn.style.display = 'none';
      const editorRow = document.createElement('div');
      editorRow.className = 'prop-row prop-newrow';
      const icon = document.createElement('span');
      icon.className = 'prop-icon';
      icon.innerHTML = propertyIconSvg('text');
      const input = document.createElement('span');
      input.className = 'prop-key prop-new-key';
      input.setAttribute('contenteditable', 'true');
      input.spellcheck = false;
      const dd = document.createElement('div');
      dd.className = 'cm-props-dropdown';
      editorRow.append(icon, input);
      box.insertBefore(editorRow, addBtn);
      box.insertBefore(dd, addBtn);
      input.focus();

      const existing = new Set(readProps().map((p) => p.key));
      const all = (await propertyProvider()).filter((p) => !existing.has(p.key));

      let done = false;
      const choose = (key: string, type: string) => {
        if (done) return;
        done = true;
        const k = key.trim();
        if (!k) {
          cleanup();
          return;
        }
        mutate((ps) => ps.push({ key: k, values: type === 'list' ? [] : [''], list: type === 'list' }));
      };
      const cleanup = () => {
        if (box.contains(editorRow)) editorRow.remove();
        if (box.contains(dd)) dd.remove();
        addBtn.style.display = '';
      };
      const renderDD = () => {
        const q = input.innerText.trim().toLowerCase();
        const matches = all.filter((p) => p.key.toLowerCase().includes(q)); // scrollable, show all
        dd.textContent = '';
        for (const p of matches) {
          const it = document.createElement('div');
          it.className = 'cm-props-dd-item';
          const ic = document.createElement('span');
          ic.className = 'prop-icon';
          ic.innerHTML = propertyIconSvg(p.type,p.key);
          const nm = document.createElement('span');
          nm.textContent = p.key;
          it.append(ic, nm);
          it.addEventListener('mousedown', (e) => {
            e.preventDefault();
            choose(p.key, p.type);
          });
          dd.appendChild(it);
        }
        dd.style.display = matches.length ? 'block' : 'none';
      };
      renderDD();
      input.addEventListener('input', renderDD);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          choose(input.innerText, 'text');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done = true;
          cleanup();
        }
      });
      input.addEventListener('blur', () => {
        // Allow a dropdown mousedown to win first; otherwise cancel an empty add.
        setTimeout(() => {
          if (!done) {
            if (input.innerText.trim()) choose(input.innerText, 'text');
            else cleanup();
          }
        }, 160);
      });
    };
    addBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      void startAdd();
    });
    if (!this.ro) box.appendChild(addBtn);
    // Reading mode: strip any remaining editing affordances (pill texts, inputs).
    if (this.ro) {
      for (const el of box.querySelectorAll('[contenteditable]')) el.removeAttribute('contenteditable');
      for (const inp of box.querySelectorAll('input')) (inp as HTMLInputElement).disabled = true;
    }
    return shell;
  }
}

/* ---------------- helpers ---------------- */

// Obsidian line/span classes (§20): HyperMD-header-N lines, cm-header-N spans.
const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1, ATXHeading2: 2, ATXHeading3: 3,
  ATXHeading4: 4, ATXHeading5: 5, ATXHeading6: 6,
};

const EMPHASIS_CLASS: Record<string, string> = {
  StrongEmphasis: 'cm-strong',
  Emphasis: 'cm-em',
  InlineCode: 'cm-inline-code cm-code',
  Strikethrough: 'cm-strikethrough cm-strike',
};

const hidden = Decoration.replace({});

function attachmentUrl(target: string): string {
  return `/api/files/content?path=${encodeURIComponent(target)}${
    notePath ? `&from=${encodeURIComponent(notePath)}` : ''
  }`;
}

/**
 * Markdown link targets are percent-encoded (`![](My%20File.png)`) and
 * attachmentUrl() encodes again, so decode once or `%20` becomes `%2520`.
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

const markdownImageCache=new WeakMap<Text,Map<number,MarkdownImage[]>>();
function markdownEmbedWidget(image:MarkdownImage,state:EditorState,editing:boolean,readonly:boolean):WidgetType {
  const target=markdownEmbedTarget(image.url),file=target.path;
  let alt=image.alt,w:number|undefined,h:number|undefined;
  const size=alt.match(/\|\s*(\d+)\s*(?:x\s*(\d+)\s*)?$/);
  if(size){alt=alt.slice(0,size.index);w=Number(size[1]);h=size[2]?Number(size[2]):undefined}
  const src=target.external?target.url:attachmentUrl(file)+target.fragment;
  let widget:WidgetType;
  if(!target.external&&(VIDEO_EXT_RE.test(file)||AUDIO_EXT_RE.test(file)))widget=new MediaWidget(src,alt,VIDEO_EXT_RE.test(file)?'video':'audio',w,h);
  else if(!target.external&&PDF_EXT_RE.test(file))widget=new PdfEmbedWidget(src,target.encodedPath,notePath,!state.readOnly,editing,readonly,'markdown');
  else if(!target.external&&/\.canvas$/i.test(file))widget=new CanvasEmbedWidget(target.encodedPath,notePath,'markdown');
  else if(!target.external&&!IMAGE_EXT_RE.test(file)){
    widget=isGenericFileEmbed(target.encodedPath)||/\.base$/i.test(file)?new WikilinkWidget(target.url,alt||file,true,undefined,'markdown'):new NoteEmbedWidget(target.url,'markdown');
  }else widget=new ImageWidget(src,alt,w,h,target.external?null:target.encodedPath,!state.readOnly,editing,'markdown');
  return widget;
}
function markdownImagesByLine(doc:Text){
  let images=markdownImageCache.get(doc);
  if(!images){images=new Map();for(const image of markdownImages(doc.toString())){const n=doc.lineAt(image.from).number;const list=images.get(n)??[];list.push(image);images.set(n,list)}markdownImageCache.set(doc,images)}
  return images;
}
function multilineMarkdownImages(state:EditorState){
  const tables=scanTables(state),defs=readingFootnotes(state).definitions;
  const frontmatter=state.doc.toString().match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/)?.[0].length??0;
  return [...markdownImagesByLine(state.doc).values()].flat().filter(image=>image.from>=frontmatter&&state.doc.lineAt(image.from).number!==state.doc.lineAt(image.to).number&&![...tables,...defs].some(r=>image.from<r.to&&image.to>r.from));
}
export const markdownEmbedField=StateField.define<DecorationSet>({
  create:buildMultilineMarkdownEmbeds,
  update(value,tr){
    if(tr.docChanged||tr.selection||syntaxTree(tr.startState)!==syntaxTree(tr.state)||tr.effects.some(e=>e.is(setLivePreviewEnabled)||e.is(setLivePreviewReadonly)))return buildMultilineMarkdownEmbeds(tr.state);
    return value.map(tr.changes);
  },
  provide:field=>EditorView.decorations.from(field),
});
function buildMultilineMarkdownEmbeds(state:EditorState):DecorationSet {
  if(!state.field(livePreviewState,false))return Decoration.none;
  const readonly=state.field(livePreviewReadonly,false)??false;
  return Decoration.set(multilineMarkdownImages(state).map(image=>{
    const editing=!readonly&&state.selection.ranges.some(r=>r.from<=image.to&&r.to>=image.from);
    const widget=markdownEmbedWidget(image,state,editing,readonly);
    return editing?Decoration.widget({widget,block:true,side:1}).range(image.to):Decoration.replace({widget,block:true}).range(image.from,image.to);
  }),true);
}
function buildDecorations(view: EditorView): DecorationSet {
  const all: Range<Decoration>[] = [];
  const sel = view.state.selection;
  const doc = view.state.doc;
  const markdownByLine=markdownImagesByLine(doc),multilineImages=multilineMarkdownImages(view.state);

  // Overlap guard: two content-replacing decorations may not overlap, or CM
  // throws and the whole plugin is disabled. Track claimed replace ranges and
  // skip any new replace that collides. Marks/line decos don't need this.
  const replaced: { from: number; to: number }[] = [];
  const pushReplace = (from: number, to: number, deco: Decoration) => {
    if (from >= to) return;
    for (const r of replaced) if (from < r.to && to > r.from) return;
    replaced.push({ from, to });
    all.push(deco.range(from, to));
  };

  // selection overlaps [from,to] (inclusive) → reveal raw syntax for that span.
  // In reading mode (readonly) nothing is ever revealed — same render, no edit.
  const readonly = view.state.field(livePreviewReadonly, false) ?? false;
  const multilineCode = liveMultilineCodeRanges(view.state);
  const touches = (from: number, to: number) => {
    if (readonly) return false;
    for (const r of sel.ranges) if (r.from <= to && r.to >= from) return true;
    return false;
  };
  const lineActive = (pos: number) => {
    if (readonly) return false;
    const line = doc.lineAt(pos);
    return touches(line.from, line.to);
  };

  const total = doc.lines;
  const comments = documentComments(view.state);
  const footnotes = readingFootnotes(view.state);
  const footnoteParts = [...footnotes.references, ...footnotes.definitions];
  const inFootnote = (from: number, to: number) => footnoteParts.some(r => from < r.to && to > r.from);
  const inComment = (from: number, to: number) => comments.some(r => from < r.to && to > r.from);
  // Frontmatter range (rendered by frontmatterField) — the regex passes skip it.
  const fmMatch = doc.sliceString(0, Math.min(doc.length, 4000)).match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
  const fmEnd = fmMatch ? fmMatch[0].length : 0;

  // Tables are rendered as block widgets by `tableField`. When a table is shown
  // (selection not inside it) the plugin must NOT decorate inside its range, or
  // its inline replaces would collide with the block widget. Editable tables
  // (selection inside) get normal raw-markdown handling.
  const tables = scanTables(view.state);
  const renderedTable = (from: number, to: number) =>
    tables.some((t) => from >= t.from && to <= t.to);

  // Raw HTML blocks are rendered by `htmlBlockField` (block widget). Same rule as
  // tables: skip plugin decorations inside a block that's shown (caret outside).
  const htmlBlocks = scanHtmlBlocks(view.state);
  const renderedHtml = (from: number, to: number) =>
    htmlBlocks.some((h) => from >= h.from && to <= h.to && !touches(h.from, h.to));
  const inlineHtml = scanInlineHtml(view.state).filter(h => !touches(h.from, h.to) &&
    ![...comments, ...multilineCode].some(r => h.from >= r.from && h.from < r.to));
  const renderedInlineHtml = (from: number, to: number) =>
    inlineHtml.some(h => from >= h.from && to <= h.to);

  // Inline code and code blocks are literal — wikilink/embed/link/tag syntax
  // inside them must stay raw (e.g. `![[file]]` in backticks is not an embed).
  const codeRanges: { from: number; to: number }[] = [...multilineCode];
  const inCode = (from: number, to: number) => {
    if(multilineImages.some(r=>from<r.to&&to>r.from))return true;
    if (inFootnote(from, to)) return true;
    if (inComment(from, to)) return true;
    for (const r of codeRanges) if (from < r.to && to > r.from) return true;
    return false;
  };

  const tree = syntaxTree(view.state);
  const bareUrls: { from: number; to: number; url: string }[] = [];

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        if (multilineImages.some(r=>node.from>=r.from&&node.to<=r.to))return false;
        if (comments.some(r => node.from >= r.from && node.to <= r.to)) return false;
        if (multilineCode.some(r => node.from >= r.from && node.to <= r.to)) return false;
        if (footnoteParts.some(r => node.from >= r.from && node.to <= r.to)) return false;

        // Record code spans/blocks so the regex passes below can skip them.
        if (name === 'InlineCode' || name === 'FencedCode' || name === 'CodeBlock') {
          codeRanges.push({ from: node.from, to: node.to });
        }

        // Don't decorate inside a rendered table/HTML block — their fields own it.
        if (renderedTable(node.from, node.to) || renderedHtml(node.from, node.to) || renderedInlineHtml(node.from, node.to)) return;

        if (name === 'URL' && !inCode(node.from, node.to)) {
          let parent = node.node.parent;
          while (parent && parent.name !== 'Link' && parent.name !== 'Image') parent = parent.parent;
          const url = doc.sliceString(node.from, node.to);
          if (!parent && /^https?:\/\//i.test(url)) bareUrls.push({ from: node.from, to: node.to, url });
        }

        // Claim the whole link before its label's emphasis/code delimiters.
        // Otherwise those replacements make the later link widget overlap and
        // leave the raw destination/title visible. The parser also retains
        // balanced parentheses in destinations that the regex cannot handle.
        if (name === 'Link' && !touches(node.from, node.to) && !inCode(node.from, node.to) &&
            doc.lineAt(node.from).number === doc.lineAt(node.to).number) {
          const marks = node.node.getChildren('LinkMark');
          const labelEnd = marks.find(mark => doc.sliceString(mark.from, mark.to) === ']');
          // A URL-shaped label has its own URL node before the destination.
          const url = labelEnd && node.node.getChildren('URL').find(part => part.from > labelEnd.to);
          if (url && labelEnd) {
            const label = doc.sliceString(node.from + 1, labelEnd.from);
            const href = doc.sliceString(url.from, url.to).replace(/^<|>$/g, '');
            pushReplace(node.from, node.to, Decoration.replace({ widget: new MdLinkWidget(label, href) }));
            return false;
          }
        }

        // Code block lines: HyperMD-codeblock(-begin/-end) like Obsidian.
        // The ``` fences are concealed while the caret is outside the block.
        // Indented code (4 spaces): mono font, NO background — just the indent
        // guide on the leading unit, like Obsidian.
        if (name === 'CodeBlock') {
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(Math.min(node.to, doc.length)).number;
          for (let i = first; i <= last; i++) {
            const l = doc.line(i);
            all.push(Decoration.line({ class: 'HyperMD-codeblock' }).range(l.from, l.from));
            const ws = l.text.match(/^(\t| {4})/);
            if (ws) all.push(Decoration.mark({ class: 'cm-indent' }).range(l.from, l.from + ws[1].length));
          }
          return;
        }

        if (name === 'FencedCode') {
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(Math.min(node.to, doc.length)).number;
          const blockTouched = touches(node.from, Math.min(node.to, doc.length));
          // Shorter or different fence strings inside a block are literal code.
          // Only parser-owned delimiters may disappear, including at EOF.
          const fenceLines = new Set(node.node.getChildren('CodeMark').map(mark => doc.lineAt(mark.from).number));
          // language from the fence info-string (§7) → flair label top-right
          const lang = doc.line(first).text.match(/^\s*(?:`{3,}|~{3,})[ \t]*([\w/+#-]*)/)?.[1] ?? '';
          for (let i = first; i <= last; i++) {
            const l = doc.line(i);
            const isFence = fenceLines.has(i);
            all.push(
              Decoration.line({
                class:
                  'HyperMD-codeblock HyperMD-codeblock-bg' +
                  (i === first ? ' HyperMD-codeblock-begin' : '') +
                  (i === last ? ' HyperMD-codeblock-end' : '')+(!blockTouched&&isFence?' cm-code-fence-hidden':''),
                attributes: i===first&&lang&&!blockTouched?{'data-lang':LanguageDescription.matchLanguageName(languages,lang,true)?.name??lang}:undefined,
              }).range(l.from, l.from),
            );
            if (!blockTouched && isFence && (i === first || i === last) && l.to > l.from) {
              pushReplace(l.from, l.to, hidden);
            }
          }
          return;
        }

        // Headings: size the line; conceal "# " unless caret on the line.
        if (HEADING_LEVEL[name]) {
          const line = doc.lineAt(node.from);
          const lv = HEADING_LEVEL[name];
          all.push(
            Decoration.line({ class: `cm-h${lv} HyperMD-header HyperMD-header-${lv}` }).range(line.from, line.from),
          );
          const m = doc.sliceString(line.from, line.to).match(/^(#{1,6}\s+)/);
          if (m) {
            if (!lineActive(node.from)) pushReplace(line.from, line.from + m[1].length, hidden);
            else
              all.push(
                Decoration.mark({ class: 'cm-formatting cm-formatting-header' }).range(
                  line.from,
                  line.from + m[1].length,
                ),
              );
          }
          return;
        }

        // Inline emphasis / code / strikethrough: always style; conceal marks
        // only when the caret is outside the span.
        if (EMPHASIS_CLASS[name]) {
          all.push(Decoration.mark({ class: EMPHASIS_CLASS[name] }).range(node.from, node.to));
          if (!touches(node.from, node.to)) {
            const sn = node.node;
            for (let c = sn.firstChild; c; c = c.nextSibling) {
              if (/Mark$/.test(c.name)) pushReplace(c.from, c.to, hidden);
            }
          }
          return;
        }
      },
    });
  }

  for (const code of multilineCode) {
    if (!touches(code.from, code.from + code.size)) pushReplace(code.from, code.from + code.size, hidden);
    if (!touches(code.to - code.size, code.to)) pushReplace(code.to - code.size, code.to, hidden);
  }
  for (const h of inlineHtml) {
    if (!renderedTable(h.from, h.to) && !renderedHtml(h.from, h.to)) {
      let html = doc.sliceString(h.from, h.to);
      if (readonly) for (const r of [...comments].reverse()) {
        if (r.from >= h.from && r.to <= h.to) html = html.slice(0, r.from - h.from) + html.slice(r.to - h.from);
      }
      pushReplace(h.from, h.to, Decoration.replace({ widget: new HtmlBlockWidget(html, true) }));
    }
  }

  // Regex passes (links, images, wikilinks, tasks, bullets, blockquotes, tags).
  for (const { from, to } of view.visibleRanges) {
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;
    for (let ln = startLine; ln <= endLine; ln++) {
      const line = doc.line(ln);
      const text = line.text;
      if(multilineImages.some(r=>line.from<=r.to&&line.to>=r.from))continue;

      if (footnotes.definitions.some(r => line.from >= r.from && line.to <= r.to)) continue;

      // Skip lines covered by a rendered table / HTML block widget.
      if (renderedTable(line.from, line.to) || renderedHtml(line.from, line.to)) continue;
      // Skip the frontmatter block (rendered by frontmatterField).
      if (line.to <= fmEnd) continue;
      // Skip lines fully inside code (fences) — bullets/tags there are literal.
      if (codeRanges.some((r) => r.from <= line.from && r.to >= line.to)) continue;
      for (const comment of comments) {
        const start = Math.max(line.from, comment.from), end = Math.min(line.to, comment.to);
        if (end <= start) continue;
        if (readonly) pushReplace(start, end, hidden);
        else all.push(Decoration.mark({ class: 'cm-comment' }).range(start, end));
      }
      if (comments.some(r => r.from <= line.from && r.to >= line.to)) continue;

      // Color spans stay editable and compose with Markdown emphasis. A whole-line
      // HTML widget would overlap the emphasis replacements built above and would
      // also render Markdown inside the span as literal punctuation.
      const colorStack: { from: number; contentFrom: number; style: string | null }[] = [];
      const colorTags = /<span\b[^>]*>|<\/span>/gi;
      let colorTag: RegExpExecArray | null;
      while ((colorTag = colorTags.exec(text))) {
        if (colorTag[0].toLowerCase() !== '</span>') {
          const style = colorTag[0].match(/^<span style="([^"]+)">$/)?.[1];
          colorStack.push({ from: line.from + colorTag.index, contentFrom: line.from + colorTags.lastIndex,
            style: style && COLOR_STYLE_RE.test(style) ? style : null });
        } else {
          const open = colorStack.pop();
          const end = line.from + colorTags.lastIndex;
          const contentTo = line.from + colorTag.index;
          if (!open?.style || inCode(open.from, open.contentFrom) || inCode(contentTo, end)) continue;
          if (contentTo > open.contentFrom) all.push(Decoration.mark({ attributes: { style: open.style } }).range(open.contentFrom, contentTo));
          if (!touches(open.from, end)) {
            pushReplace(open.from, open.contentFrom, hidden);
            pushReplace(contentTo, end, hidden);
          }
        }
      }


      // Horizontal rule: `---` / `***` / `___` → <hr> when the caret is elsewhere.
      if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(text) && !inCode(line.from, line.to)) {
        all.push(Decoration.line({ class: 'HyperMD-hr' }).range(line.from, line.from));
        if (!lineActive(line.from) && line.to > line.from) {
          pushReplace(line.from, line.to, Decoration.replace({ widget: new HrWidget() }));
        }
        continue;
      }

      // Blockquote / callout (callout regex + colors/icons per §7/§21).
      // `bodyStart` = offset past the `>` markers so list/task handling below
      // also works INSIDE quotes and callouts.
      let bodyStart = 0;
      if (QUOTE_LINE_RE.test(text)) {
        const prefix = text.match(QUOTE_MARKERS_RE)![0];
        const depth = (prefix.match(/>/g) ?? []).length;
        bodyStart = prefix.length;
        // First/last line of this contiguous quote run
        let firstLn = ln;
        while (firstLn > 1 && quoteDepth(doc.line(firstLn - 1).text) >= depth) firstLn--;
        let lastLn = ln;
        while (lastLn < total && quoteDepth(doc.line(lastLn + 1).text) >= depth) lastLn++;
        const titleLineFrom = doc.line(firstLn).from;
        const firstInner = doc.line(firstLn).text.replace(QUOTE_MARKERS_RE, '');
        const cm = firstInner.match(CALLOUT_RE);
        const editingCallout=cm&&!readonly&&touches(titleLineFrom,doc.line(lastLn).to);
        if (cm&&!editingCallout) {
          const type = cm[1].split('|')[0].trim().toLowerCase().replace(/\s+/g, '-');
          const slot = CALLOUT_SLOT[type] ?? 'default';
          const attributes = { style: `--callout-color: var(--callout-${slot})`, 'data-callout-start': String(titleLineFrom) };
          const folded = cm[2] ? isCalloutFolded(view.state, titleLineFrom, cm[2]) : false;
          all.push(
            Decoration.line({
              class:
                'cm-callout cm-callout-line' +
                (ln === firstLn ? ' cm-callout-first' : '') +
                (ln === lastLn || (ln === firstLn && folded) ? ' cm-callout-last' : ''),
              attributes,
            }).range(line.from, line.from),
          );
          if (ln === firstLn) {
            const markLen = bodyStart + cm[0].length;
            const title = text.slice(markLen).trim();
            if (!lineActive(line.from)) {
              pushReplace(
                line.from,
                line.from + markLen,
                Decoration.replace({
                  widget: new CalloutHeadWidget(
                    slot,
                    title ? '' : calloutDefaultTitle(type),
                    cm[2],
                    folded,
                    titleLineFrom,
                  ),
                }),
              );
            }
            if (title) {
              all.push(Decoration.mark({ class: 'cm-callout-title' }).range(line.from + markLen, line.to));
            }
            if(cm[2])all.push(Decoration.widget({widget:new CalloutFoldWidget(folded,titleLineFrom),side:-2}).range(line.to));
            if(!readonly)all.push(Decoration.widget({widget:new CalloutSourceWidget(titleLineFrom,doc.line(lastLn).to),side:-1}).range(line.to));
            bodyStart = markLen; // list handling applies to the rest of the title line
          } else if (!lineActive(line.from)) {
            pushReplace(line.from, line.from + bodyStart, hidden);
          }
        } else if(editingCallout){
          const end=line.from+prefix.length+(ln===firstLn?cm![0].length:0);if(end>line.from)all.push(Decoration.mark({class:'cm-formatting-quote'}).range(line.from,Math.min(end,line.to)));
        } else if(!cm) {
          // Plain quote: depth via background bars (data-quote-depth) — nested
          // `> >` renders one bar per level like Obsidian.
          all.push(
            Decoration.line({
              class: 'cm-blockquote HyperMD-quote',
              attributes: { 'data-quote-depth': String(Math.min(depth, 3)) },
            }).range(line.from, line.from),
          );
          if (!lineActive(line.from)) {
            pushReplace(line.from, line.from + bodyStart, hidden);
          }
        }
      }

      // Task checkbox + bullet — applied to the line body (works in quotes /
      // callouts too). Per §7 any single char is a valid status and any
      // non-space status counts as checked (no hard-coded custom-state list).
      const body = bodyStart ? text.slice(bodyStart) : text;
      const bodyFrom = line.from + bodyStart;
      // Only a complete tab/four-space group has a fixed indent width. A two-space
      // child keeps its partial spacing, so it cannot collapse onto a four-space child.
      const indentParts=(ws:string)=>[...ws.matchAll(/\t| {4}| {1,3}/g)].map(m=>({from:m.index!,text:m[0]}));
      const indentGuides = (ws: string) => {
        for(const part of indentParts(ws)){
          const full=part.text==='\t'||part.text.length===4;
          all.push(Decoration.mark({class:full?'cm-indent':'cm-indent-spacing',...(full?{}:{attributes:{style:`--indent-spacing:${part.text.length*.275}em`}})}).range(bodyFrom+part.from,bodyFrom+part.from+part.text.length));
        }
      };
      const hang = (ws: string, markerW?: string, orderedTask = false): Record<string, string> => {
        if (bodyStart) return {};
        const prefix=[...indentParts(ws).map(p=>p.text==='\t'||p.text.length===4?'var(--hang-indent-w)':`${p.text.length*.275}em`),'var(--hang-marker-w)',...(orderedTask?['var(--font-text-size)','6px']:[])].join(' + ');
        return {style:`${markerW?`--hang-marker-w:${markerW};`:''}--hang-prefix:calc(${prefix})`};
      };
      const task = body.match(/^(\s*)([-*+]|\d{1,9}[.)])(\s+)\[(.)\](\s+|$)/);
      if (task) {
        const ordered = /^\d/.test(task[2]);
        const markerW = ordered ? `${(1.6 + (task[2].length - 2) * 0.6).toFixed(2)}em` : undefined;
        all.push(
          Decoration.line({
            class: bodyStart ? 'HyperMD-list-line HyperMD-task-line' : 'HyperMD-list-line HyperMD-task-line HyperMD-hang',
            attributes: { 'data-task': task[4], ...hang(task[1], markerW, ordered) },
          }).range(line.from, line.from),
        );
        indentGuides(task[1]);
        const start = bodyFrom + task[1].length;
        const markerEnd = start + task[2].length;
        const boxPos = markerEnd + task[3].length + 1;
        if (!touches(line.from, boxPos + 2)) {
          if (ordered) {
            all.push(Decoration.mark({ class: 'cm-ol-marker' }).range(start, markerEnd));
            // The number keeps its own box; the checkbox supplies the following gap.
            if (!bodyStart) pushReplace(markerEnd, boxPos - 1, hidden);
            else if (task[3].length > 1) pushReplace(markerEnd + 1, boxPos - 1, hidden);
          }
          pushReplace(ordered ? boxPos - 1 : start, bodyFrom + task[0].length,
            Decoration.replace({ widget: new CheckboxWidget(task[4] !== ' ', boxPos) }));
        }
      } else {
        const bullet = body.match(/^(\s*)([-*+])(\s+)/);
        if (bullet) {
          all.push(
            Decoration.line({
              class: bodyStart ? 'HyperMD-list-line' : 'HyperMD-list-line HyperMD-hang',
              attributes: hang(bullet[1]),
            }).range(line.from, line.from),
          );
          indentGuides(bullet[1]);
          // Replace the `-`/`*`/`+` marker with a bullet and collapse its trailing
          // whitespace to a single space, so `-   Item` reads `• Item` like Obsidian.
          const start = bodyFrom + bullet[1].length;
          const markerEnd = start + 1;
          const spaceEnd = markerEnd + bullet[3].length;
          if (!touches(start, spaceEnd)) {
            pushReplace(start, markerEnd + 1, Decoration.replace({ widget: new BulletWidget() }));
            if (bullet[3].length > 1) pushReplace(markerEnd + 1, spaceEnd, hidden);
          }
        } else {
          // Ordered list: keep the `1.` but collapse extra spaces after it. The marker
          // is drawn in a fixed-width box (width grows with digit count) so wrapped
          // lines can hang under the text, like bullets.
          const ol = body.match(/^(\s*)(\d{1,9}[.)])(\s+)/);
          if (ol) {
            const digits = ol[2].length - 1;
            const markerW = `${(1.6 + (digits - 1) * 0.6).toFixed(2)}em`;
            all.push(
              Decoration.line({
                class: bodyStart ? 'HyperMD-list-line' : 'HyperMD-list-line HyperMD-hang',
                attributes: hang(ol[1], markerW),
              }).range(line.from, line.from),
            );
            indentGuides(ol[1]);
            const start = bodyFrom + ol[1].length;
            const markerEnd = start + ol[2].length;
            const spaceEnd = markerEnd + ol[3].length;
            if (!touches(start, spaceEnd)) {
              if (bodyStart) {
                // In quotes/callouts there is no hanging box: keep one space after the marker.
                if (ol[3].length > 1) pushReplace(markerEnd + 1, spaceEnd, hidden);
              } else {
                all.push(Decoration.mark({ class: 'cm-ol-marker' }).range(start, markerEnd));
                pushReplace(markerEnd, spaceEnd, hidden);
              }
            }
          }
        }
      }

      // Inline tags → pill styling. Charset per §7; an editor tag must contain a
      // letter and a pure-number tag (#123) is not a tag.
      const tagRe = /(^|\s)(#[^ -⁯⸀-⹿'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s]+)/g;
      let tm: RegExpExecArray | null;
      while ((tm = tagRe.exec(text))) {
        const tag = tm[2];
        if (/^#\d+$/.test(tag) || !/[a-z]/i.test(tag)) continue;
        const s = line.from + tm.index + tm[1].length;
        if (inCode(s, s + tag.length)) continue;
        all.push(Decoration.mark({ class: 'cm-hashtag cm-hashtag-begin cm-tag' }).range(s, s + 1));
        all.push(Decoration.mark({ class: 'cm-hashtag cm-hashtag-end cm-tag' }).range(s + 1, s + tag.length));
      }

      // Footnote definition `[^1]: text` → superscript marker, brackets concealed.
      const fdef = text.match(/^\[\^([^\]\s]+)\]:/);
      if (fdef) {
        all.push(Decoration.line({ class: 'HyperMD-footnote' }).range(line.from, line.from));
        all.push(Decoration.mark({ class: 'cm-footref' }).range(line.from + 2, line.from + 2 + fdef[1].length));
        if (!lineActive(line.from)) {
          pushReplace(line.from, line.from + 2, hidden);
          const close = line.from + 2 + fdef[1].length;
          pushReplace(close, close + 2, hidden);
        }
      }

      // ==Highlight== → <mark>-style; conceal the markers when the caret is outside.
      const hlRe = /==(?![\s=])(.+?)==/g;
      let m: RegExpExecArray | null;
      while ((m = hlRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (inCode(s, e)) continue;
        all.push(Decoration.mark({ class: 'cm-highlight' }).range(s + 2, e - 2));
        if (!touches(s, e)) {
          pushReplace(s, s + 2, hidden);
          pushReplace(e - 2, e, hidden);
        } else {
          all.push(Decoration.mark({ class: 'cm-formatting cm-formatting-highlight' }).range(s, s + 2));
          all.push(Decoration.mark({ class: 'cm-formatting cm-formatting-highlight' }).range(e - 2, e));
        }
      }

      // $$Display math$$ (single-line) — rendered via KaTeX when the caret is outside.
      const dmathRe = /\$\$(.+?)\$\$/g;
      while ((m = dmathRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (inCode(s, e)) continue;
        if (!touches(s, e)) pushReplace(s, e, Decoration.replace({ widget: new MathWidget(m[1],true,{from:s,to:e},!readonly) }));
        else all.push(Decoration.mark({ class: 'cm-math' }).range(s, e));
      }

      // Inline $math$ — open not followed by space, close not preceded by space (§7).
      const mathRe = /(?<![$\\])\$(?![\s$])((?:\\\$|[^$\n])+?)(?<![\s\\])\$(?!\d|\$)/g;
      while ((m = mathRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (inCode(s, e)) continue;
        if (!touches(s, e)) pushReplace(s, e, Decoration.replace({ widget: new MathWidget(m[1], false) }));
        else all.push(Decoration.mark({ class: 'cm-math' }).range(s, e));
      }

      // Footnote refs [^id] (not a definition) → superscript.
      const fnRe = /\[\^([^\]\s]+)\](?!:)/g;
      while ((m = fnRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (inCode(s, e)) continue;
        all.push(Decoration.mark({ class: 'cm-footref' }).range(s, e));
      }

      // Inline footnote ^[note] → superscript styling for the whole token (§7).
      const ifnRe = /\^\[([^\]]+)\]/g;
      while ((m = ifnRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (inCode(s, e)) continue;
        all.push(Decoration.mark({ class: 'cm-footref' }).range(s, e));
      }

      // Trailing block id ` ^abc-123` (charset [a-zA-Z0-9-] only, §7).
      const bid = text.match(/(^|\s)(\^[a-zA-Z0-9-]+)$/);
      if (bid) {
        const s = line.to - bid[2].length;
        all.push(Decoration.mark({ class: 'cm-blockid' }).range(s, line.to));
      }

      // Bare URLs → styled like links (Obsidian cm-url).
      const urlRe = /(^|[\s(<])((?:https?|ftp):\/\/[^\s<>)"']+)/g;
      while ((m = urlRe.exec(text))) {
        const s = line.from + m.index + m[1].length;
        const e = s + m[2].length;
        if (inCode(s, e)) continue;
        all.push(Decoration.mark({ class: 'cm-url' }).range(s, e));
      }

      // Wikilinks / embeds — alias after the FIRST `|`; default display text
      // `href.split('#').filter(Boolean).join(' > ')`; nested `[[` rejected (§7).
      const wikiRe = /(!?)\[\[(.+?)\]\]/g;
      while ((m = wikiRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (inCode(s, e) || isEscaped(text, m.index)) continue;
        if((markdownByLine.get(line.number)??[]).some(r=>s>=r.from&&s<r.to))continue;
        const inner = m[2];
        if (inner.includes('[[')) continue;
        const isEmbed = m[1] === '!';
        const editing=touches(s,e);
        if(editing&&!isEmbed)continue;
        // Live Preview keeps rendered embeds when their source is selected.
        // Source mode disables this plugin; ordinary links still reveal text only.
        const putWidget=(widget:WidgetType)=>{
          if(editing)all.push(Decoration.widget({widget,side:1}).range(e));
          else pushReplace(s,e,Decoration.replace({widget}));
        };
        const pi = inner.indexOf('|');
        const href = (pi > 0 ? inner.slice(0, pi) : inner)
          .replace(/\\$/, '')
          .replace(/ /g, ' ')
          .trim()
          .normalize('NFC');
        const alias = pi > 0 ? inner.slice(pi + 1).trim() : null;
        const defaultDisplay = href.split('#').filter(Boolean).join(' > ');
        const file=href.split('#')[0];
        const fragment=href.includes('#')?href.slice(href.indexOf('#')):'';
        if (isEmbed && IMAGE_EXT_RE.test(file)) {
          // image size param: the LAST `|` segment, `300` or `300x200`
          let w: number | undefined;
          let h: number | undefined;
          if (pi > 0) {
            const segs = inner.split('|');
            const sm = segs[segs.length - 1].match(/^\s*([0-9]+)\s*(?:x\s*([0-9]+)\s*)?$/);
            if (sm) {
              w = Number(sm[1]);
              h = sm[2] ? Number(sm[2]) : undefined;
            }
          }
          putWidget(new ImageWidget(attachmentUrl(file), href, w, h, file,!view.state.readOnly,editing));
        } else if (isEmbed && (VIDEO_EXT_RE.test(file) || AUDIO_EXT_RE.test(file))) {
          // `![[clip.mp4]]` / `![[song.mp3]]` → native HTML5 player like Obsidian.
          const kind = VIDEO_EXT_RE.test(file) ? 'video' : 'audio';
          // width param (video only): last `|` segment `300` / `300x200`
          let w: number | undefined;
          let h: number | undefined;
          if (kind === 'video' && pi > 0) {
            const segs = inner.split('|');
            const sm = segs[segs.length - 1].match(/^\s*([0-9]+)\s*(?:x\s*([0-9]+)\s*)?$/);
            if (sm) {w = Number(sm[1]);h=sm[2]?Number(sm[2]):undefined;}
          }
          putWidget(new MediaWidget(attachmentUrl(file)+fragment, href, kind, w,h));
        } else if (isEmbed && PDF_EXT_RE.test(href.split('#')[0])) {
          // FR-21: `![[doc.pdf]]` → the browser's viewer inline, like Obsidian.
          // The `#page=…` fragment (if any) addresses the viewer, not the file API.
          putWidget(new PdfEmbedWidget(attachmentUrl(href.split('#')[0])+fragment, href.split('#')[0], notePath,!view.state.readOnly,editing,readonly));
        } else if(isEmbed&&/\.canvas$/i.test(file)){
          putWidget(new CanvasEmbedWidget(href,notePath));
        } else if(isEmbed&&isGenericFileEmbed(file)){
          putWidget(new WikilinkWidget(href,alias||href,true));
        } else if (isEmbed && (!/\.[a-z0-9]{1,5}$/i.test(href.split('#')[0])||/\.(md|markdown)$/i.test(href.split('#')[0]))) {
          // `![[note]]` (no binary extension) → real transclusion like Obsidian.
          putWidget(new NoteEmbedWidget(href));
        } else {
          // LP shows the raw target text (`Note#Head`); the `Note > Head` display
          // form is reading-view behaviour and goes into aria-label like Obsidian.
          const label = alias || href;
          putWidget(new WikilinkWidget(href,label,isEmbed,defaultDisplay!==label?defaultDisplay:undefined));
        }
      }

      // Standalone media URL → inline player (raw URL shows while the caret is on it)
      const embedM = text.match(/^\s*(https?:\/\/\S+)\s*$/);
      if (embedM) {
        const s = line.from + text.indexOf(embedM[1]);
        const e = s + embedM[1].length;
        const emb = !touches(s, e) && !inCode(s, e) ? resolveExternalEmbed(embedM[1]) : null;
        if (emb) pushReplace(s, e, Decoration.replace({ widget: new ExternalEmbedWidget(emb) }));
      }

      // All standard Markdown embeds use parser positions and the same media
      // dispatch as wiki embeds. References may resolve through definitions.
      for(const image of markdownByLine.get(line.number)??[]){
        const s=image.from,e=image.to;if(inCode(s,e))continue;
        const editing=touches(s,e),widget=markdownEmbedWidget(image,view.state,editing,readonly);
        if(editing)all.push(Decoration.widget({widget,side:1}).range(e));else pushReplace(s,e,Decoration.replace({widget}));
      }

      // Markdown links [text](url) — not preceded by ! (those are images)
      const linkRe = /(?<!\!)\[([^\]]+?)\]\(([^)]+)\)/g;
      while ((m = linkRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (touches(s, e) || inCode(s, e)) continue;
        const url = m[2].replace(/\s+"[^"]*"$/, '').trim();
        pushReplace(s, e, Decoration.replace({ widget: new MdLinkWidget(m[1], url) }));
      }

      // Markdown escapes `\.` `\*` … — conceal the backslash like Obsidian LP
      // (e.g. Trilium/turndown exports escape `2\.` to avoid list parsing).
      // MUST run LAST: pushReplace's overlap guard would otherwise block math/
      // link widgets whose range contains an escape (e.g. `\,` inside $$…$$).
      if (!lineActive(line.from)) {
        const escRe = /\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g;
        let em: RegExpExecArray | null;
        while ((em = escRe.exec(text))) {
          const s = line.from + em.index;
          if (inCode(s, s + 2)) continue;
          pushReplace(s, s + 1, hidden);
        }
      }
    }
  }

  // Keep ordinary addresses compact. Embedded media and authored links retain
  // ownership of their ranges; a bare address never requests metadata/cards.
  for (const url of bareUrls) {
    if (!touches(url.from, url.to)) pushReplace(url.from, url.to, Decoration.replace({ widget: new BareUrlWidget(url.url) }));
  }
  return Decoration.set(all, true);
}

/* ---------------- frontmatter (block widget; needs a StateField) ---------------- */

function buildFrontmatter(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const text = state.doc.sliceString(0, Math.min(state.doc.length, 4000));
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!fm || !editableFrontmatter(fm[1])) return Decoration.none;
  const end = fm[0].length;
  const blockEnd = text[end - 1] === '\n' ? end - 1 : end;
  // Always show the interactive Properties editor (like Obsidian); editing happens
  // in the widget, so the caret no longer reveals raw YAML in Live mode.
  const ro = state.field(livePreviewReadonly, false) ?? false;
  return Decoration.set([
    Decoration.replace({ widget: new FrontmatterWidget(fm[1], ro), block: true }).range(0, blockEnd),
  ]);
}

export const setLivePreviewEnabled = StateEffect.define<boolean>();

export const livePreviewState = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLivePreviewEnabled)) return e.value;
    return value;
  },
});

/**
 * Reading mode = the SAME Live Preview pipeline, read-only: when set, the
 * caret/selection never reveals raw syntax, so everything stays rendered.
 */
export const setLivePreviewReadonly = StateEffect.define<boolean>();

export const livePreviewReadonly = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLivePreviewReadonly)) return e.value;
    return value;
  },
});

/* ---------------- inline title (note filename, Obsidian-style) ---------------- */

class TitleWidget extends WidgetType {
  constructor(readonly title: string) {
    super();
  }
  eq(o: TitleWidget) {
    return o.title === this.title;
  }
  toDOM() {
    const d = document.createElement('div');
    d.className = 'cm-inline-title';
    d.textContent = this.title;
    return d;
  }
}

export const setNoteTitle = StateEffect.define<string>();

export const noteTitleField = StateField.define<string>({
  create: () => '',
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setNoteTitle)) return e.value;
    return value;
  },
});

function buildInlineTitle(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const baseTitle = state.field(noteTitleField, false) ?? '';
  if (!baseTitle) return Decoration.none;
  const title = frontmatterTitle(state.doc.sliceString(0, Math.min(state.doc.length, 2000))) ?? baseTitle;
  // Skip when the note already opens with an H1 equal to the title — the Trilium
  // export repeats the title as a heading, and Obsidian would otherwise show it twice.
  const head = state.doc.sliceString(0, Math.min(state.doc.length, 2000));
  const noFm = head.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '');
  const firstLine = noFm.split(/\r?\n/).find((l) => l.trim() !== '');
  const h1 = firstLine?.match(/^#\s+(.+?)\s*$/);
  if (h1 && h1[1].trim().toLowerCase() === title.trim().toLowerCase()) return Decoration.none;
  return Decoration.set([Decoration.widget({ widget: new TitleWidget(title), block: true, side: -1 }).range(0)]);
}

export const inlineTitleField = StateField.define<DecorationSet>({
  create: (state) => buildInlineTitle(state),
  update(value, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(setNoteTitle) || e.is(setLivePreviewEnabled))) {
      return buildInlineTitle(tr.state);
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const frontmatterField = StateField.define<DecorationSet>({
  create: (state) => buildFrontmatter(state),
  update(value, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setLivePreviewEnabled) || e.is(setLivePreviewReadonly))) {
      return buildFrontmatter(tr.state);
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---------------- tables (block widgets; need a StateField) ---------------- */

function buildTables(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const tables = scanTables(state);
  if (!tables.length) return Decoration.none;
  const ro = state.field(livePreviewReadonly, false) ?? false;
  // Like Obsidian, tables are ALWAYS shown as the interactive widget (never as raw
  // pipes) — editing happens in-cell, so the selection no longer reveals raw.
  const ranges: Range<Decoration>[] = tables.map((t) =>
    Decoration.replace({ widget: new TableWidget(t, ro), block: true }).range(t.from, t.to),
  );
  return Decoration.set(ranges, true);
}

export const tableField = StateField.define<DecorationSet>({
  create: (state) => buildTables(state),
  update(value, tr) {
    // Long notes are parsed incrementally. A new tree can reveal tables without
    // a document/selection change or a manual Source -> Live toggle.
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
        tr.effects.some((e) => e.is(setLivePreviewEnabled) || e.is(setLivePreviewReadonly))) {
      return buildTables(tr.state);
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---------------- raw HTML blocks (block widgets; need a StateField) ---------------- */

interface ReadingFootnotes {
  references: (SourceRange & { html: string })[];
  definitions: SourceRange[];
  html: string;
}
const footnoteCache = new WeakMap<Text, ReadingFootnotes>();
function readingFootnotes(state: EditorState): ReadingFootnotes {
  const empty = { references: [], definitions: [], html: '' };
  if (!state.field(livePreviewReadonly, false)) return empty;
  const cached = footnoteCache.get(state.doc);
  if (cached) return cached;
  const source = state.doc.toString();
  const positions = footnoteRanges(source);
  if (!positions.references.length) return empty;
  const template = document.createElement('template');
  template.innerHTML = renderMarkdownBody(source, attachmentUrl);
  const refs = [...template.content.querySelectorAll('a[data-footnote-ref]')];
  const result = {
    references: positions.references.flatMap((range, index) => refs[index] ? [{ ...range, html: refs[index].outerHTML }] : []),
    definitions: positions.definitions,
    html: template.content.querySelector('[data-footnotes]')?.outerHTML ?? '',
  };
  footnoteCache.set(state.doc, result);
  return result;
}

class ReadingFootnoteWidget extends WidgetType {
  constructor(readonly html: string, readonly block = false) { super(); }
  eq(other: ReadingFootnoteWidget) { return other.html === this.html && other.block === this.block; }
  toDOM(view: EditorView) {
    const element = document.createElement(this.block ? 'div' : 'sup');
    element.className = this.block ? 'cm-reading-footnotes markdown-preview' : 'cm-footref';
    element.innerHTML = this.html; // Already sanitized by the shared renderer.
    element.addEventListener('click', event => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor?.hash) return;
      event.preventDefault();
      const id = decodeURIComponent(anchor.hash.slice(1));
      [...view.dom.querySelectorAll<HTMLElement>('[id]')].find(el => el.id === id)?.scrollIntoView({ block: 'nearest' });
    });
    return element;
  }
  ignoreEvent() { return true; }
}

function buildHtmlBlocks(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const blocks = scanHtmlBlocks(state);
  const ro = state.field(livePreviewReadonly, false) ?? false;
  const ranges: Range<Decoration>[] = [];
  for (const b of blocks) {
    let touched = false;
    if (!ro)
      for (const r of state.selection.ranges) {
        if (r.from <= b.to && r.to >= b.from) {
          touched = true;
          break;
        }
      }
    if (touched) continue;
    const html = state.doc.sliceString(b.from, b.to);
    ranges.push(Decoration.replace({ widget: new HtmlBlockWidget(html), block: true }).range(b.from, b.to));
  }
  const notes = readingFootnotes(state);
  const tables = scanTables(state);
  for (const ref of notes.references) {
    if (tables.some(t => ref.from >= t.from && ref.to <= t.to)) continue;
    ranges.push(Decoration.replace({ widget: new ReadingFootnoteWidget(ref.html) }).range(ref.from, ref.to));
  }
  for (const def of notes.definitions) ranges.push(Decoration.replace({ block: true }).range(def.from, def.to));
  if (notes.html) ranges.push(Decoration.widget({ widget: new ReadingFootnoteWidget(notes.html, true), block: true, side: 1 }).range(state.doc.length));
  return Decoration.set(ranges, true);
}

export const htmlBlockField = StateField.define<DecorationSet>({
  create: (state) => buildHtmlBlocks(state),
  update(value, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setLivePreviewEnabled) || e.is(setLivePreviewReadonly))) {
      return buildHtmlBlocks(tr.state);
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private hoveredCallout: HTMLElement | null = null;
    private readonly clearHover = () => {
      this.hoveredCallout?.classList.remove('is-hovered');
      this.hoveredCallout = null;
    };
    private readonly onPointerOver = (event: PointerEvent) => {
      const line = event.target instanceof Element ? event.target.closest<HTMLElement>('.cm-callout-line') : null;
      const first = line && this.view.contentDOM.contains(line)
        ? this.view.contentDOM.querySelector<HTMLElement>(`.cm-callout-first[data-callout-start="${line.dataset.calloutStart}"] .cm-callout-source`)
        : null;
      if (first === this.hoveredCallout) return;
      this.clearHover();
      this.hoveredCallout = first;
      first?.classList.add('is-hovered');
    };
    constructor(private readonly view: EditorView) {
      this.decorations = view.state.field(livePreviewState) ? buildDecorations(view) : Decoration.none;
      // Callout bodies occupy sibling CodeMirror lines. Capture also covers
      // interactive widgets whose ignoreEvent prevents editor event handlers.
      view.dom.addEventListener('pointerover', this.onPointerOver, true);
      view.dom.addEventListener('pointerleave', this.clearHover);
    }
    destroy() {
      this.clearHover();
      this.view.dom.removeEventListener('pointerover', this.onPointerOver, true);
      this.view.dom.removeEventListener('pointerleave', this.clearHover);
    }
    update(u: ViewUpdate) {
      if (!u.state.field(livePreviewState)) {
        this.decorations = Decoration.none;
        return;
      }
      if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state) ||
          u.transactions.some((t) => t.effects.length)) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(event, view) {
        if (!view.state.field(livePreviewState)) return false;
        const target = event.target instanceof Element ? event.target.closest('.cm-url') : null;
        if (!target || target.closest('a')) return false;
        // The editing form is a CodeMirror mark, not a widget. It must stay
        // clickable too when the caret reveals the literal address.
        let node = syntaxTree(view.state).resolveInner(view.posAtDOM(target), 1);
        while (node.parent && node.name !== 'URL') node = node.parent;
        if (node.name !== 'URL') return false;
        const url = view.state.doc.sliceString(node.from, node.to);
        if (!/^https?:\/\//i.test(url)) return false;
        event.preventDefault(); window.open(url, '_blank', 'noopener'); return true;
      },
    },
  },
);

/**
 * Make a single click land the caret exactly where the user clicked, so the
 * clicked line becomes "active" and its concealed markup reveals immediately.
 * Tall heading line-boxes and the focus-gaining click on a contenteditable can
 * otherwise swallow the first click, which is why editing a heading "took
 * several clicks". We only act on a plain click (no shift = not range-extending)
 * and let CodeMirror still handle drag-select normally.
 *
 * Two things can still move the caret away from the clicked row, and both are
 * handled here: CodeMirror leaves it put when `posAtCoords` has no precise answer
 * (the padding of a tall heading line-box — fixed on mousedown), and the browser's
 * own contenteditable caret placement picks a *neighbouring* line when the click
 * lands in the blank part of a line whose only content is a widget, an image line
 * say (re-asserted on mouseup, once the native handling has run). Widgets that own
 * their interaction are left untouched.
 */
const INTERACTIVE_WIDGET =
  'input, textarea, select, audio, video, iframe, [contenteditable="true"]:not(.cm-content), ' +
  '.cm-table-wrap, .cm-properties, .cm-media-wrap, .cm-note-embed';
let plainClickAt: { x: number; y: number } | null = null;

export const editorClickFix = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || event.shiftKey || event.altKey || event.detail > 1) {
      plainClickAt = null;
      return false;
    }
    plainClickAt = { x: event.clientX, y: event.clientY };
    // `precise: false` returns the CLOSEST position and never null, so clicking
    // anywhere on a tall heading line-box (incl. its padding, where the default
    // posAtCoords returns null and CM leaves the caret put) still moves the caret
    // onto that line — which reveals its concealed markup on the first click.
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    view.dispatch({ selection: { anchor: pos } });
    return false; // let CodeMirror handle focus/drag normally too
  },
  mouseup(event, view) {
    const start = plainClickAt;
    plainClickAt = null;
    if (!start || event.button !== 0 || event.shiftKey || event.detail > 1) return false;
    // A drag: keep the selection CodeMirror built.
    if (Math.abs(event.clientX - start.x) > 3 || Math.abs(event.clientY - start.y) > 3) return false;
    const target = event.target as HTMLElement | null;
    if (target && typeof target.closest === 'function' && target.closest(INTERACTIVE_WIDGET)) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    if (pos != null && pos !== view.state.selection.main.head) view.dispatch({ selection: { anchor: pos } });
    return false;
  },
});

/**
 * Re-measure when media inside the editor finishes loading. CodeMirror's height
 * oracle only sees the DOM as it is during a measure pass and it does not listen for
 * `load`/`error` events, so an attachment that arrives afterwards leaves the height
 * map short by its own height — every click below it then resolves one or two lines
 * too low until something else forces a re-measure (a keystroke, or a scroll).
 */
export const mediaLoadRemeasure = ViewPlugin.fromClass(
  class {
    private readonly onLoad = () => this.view.requestMeasure();
    constructor(private readonly view: EditorView) {
      view.dom.addEventListener('load', this.onLoad, true);
      view.dom.addEventListener('error', this.onLoad, true);
    }
    destroy() {
      this.view.dom.removeEventListener('load', this.onLoad, true);
      this.view.dom.removeEventListener('error', this.onLoad, true);
    }
  },
);

/**
 * Dev-only guard for exactly the bug above: CodeMirror's height map must describe what
 * the editor actually rendered. When the map is short, some CSS inside the editor
 * contributes vertical space the oracle cannot see — a `margin` on an editor block is
 * the usual cause — and every click below the gap lands a line or two low. Silence in
 * a production build.
 */
export const livePreviewGeometryGuard = import.meta.env.DEV
  ? ViewPlugin.fromClass(
      class {
        private timer: ReturnType<typeof setTimeout> | null = null;
        private warned = 0;
        constructor(private readonly view: EditorView) {
          this.schedule();
        }
        update() {
          this.schedule();
        }
        destroy() {
          if (this.timer) clearTimeout(this.timer);
        }
        private schedule() {
          if (this.timer) clearTimeout(this.timer);
          this.timer = setTimeout(() => this.verify(), 400);
        }
        private verify() {
          this.timer = null;
          const view = this.view;
          // An attachment still in flight legitimately changes the height afterwards.
          if ([...view.contentDOM.querySelectorAll('img')].some((img) => !img.complete)) {
            this.schedule();
            return;
          }
          // Both include the content padding, so the difference is the unmeasured space.
          const drift = view.contentDOM.scrollHeight - view.contentHeight;
          if (drift > 4 && Math.abs(drift - this.warned) > 1) {
            this.warned = drift;
            console.warn(
              `[webobsidian] the editor's height map is ${drift.toFixed(1)}px short of the rendered ` +
                'content, so clicks below that gap land on the wrong line. Vertical margins inside ' +
                '.cm-content are invisible to CodeMirror — use padding (README › Live Preview geometry).',
            );
          }
        }
      },
    )
  : [];

export const livePreviewTheme = EditorView.baseTheme({
  // Heading sizes/weights come from the stylesheet (.cm-s-obsidian .HyperMD-header-N,
  // §19 tokens). The theme only strips CodeMirror's default heading underline.
  '.cm-h1, .cm-h2, .cm-h3, .cm-h4, .cm-h5, .cm-h6': { textDecoration: 'none' },
  '.cm-h1 span, .cm-h2 span, .cm-h3 span, .cm-h4 span, .cm-h5 span, .cm-h6 span': {
    textDecoration: 'none !important',
  },
  // Inline title = h1 alias (§19).
  '.cm-inline-title': {
    fontSize: 'var(--h1-size)',
    fontWeight: 'var(--h1-weight)',
    lineHeight: 'var(--line-height-tight)',
    letterSpacing: '-0.015em',
    color: 'var(--text-normal)',
    // Space below the title is PADDING, not a margin: CodeMirror's height oracle
    // measures border-box rects only, so margins between blocks are invisible to it
    // and every click lands ~1 line too low (see README › Live Preview geometry).
    margin: '0',
    padding: '0 0 0.5em',
  },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through' },
  '.cm-code': {
    fontFamily: 'var(--font-mono)',
    background: 'var(--background-primary-alt)',
    borderRadius: '4px',
    padding: '0.5px 4px',
    fontSize: 'var(--font-smaller)',
  },
  '.cm-bullet': { color: 'var(--text-faint)' },
  // Links: accent-coloured and underlined like Obsidian. `inline-block` gives the
  // browser a soft-wrap opportunity after the widget, so text glued to `]]` in the
  // source (e.g. `]]and`) can still wrap onto the next line as it does in Obsidian.
  '.cm-wikilink, .cm-md-link': {
    color: 'var(--text-accent)',
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationThickness: '1px',
    textUnderlineOffset: '2px',
    display: 'inline-block',
    textIndent: '0',
    verticalAlign: 'baseline',
  },
  '.cm-wikilink:hover, .cm-md-link:hover': { textDecoration: 'underline' },
  // External-link arrow glyph trailing http(s) links.
  '.cm-external-icon': {
    width: '0.78em',
    height: '0.78em',
    display: 'inline-block',
    verticalAlign: 'baseline',
    margin: '0 1px 0 3px',
    position: 'relative',
    top: '1px',
  },
  '.cm-task-checkbox': { verticalAlign: 'middle', marginRight: '4px', cursor: 'pointer' },
  '.cm-embed-image': { maxWidth: '100%', borderRadius: '6px', display: 'block', margin: '0' },
  '.cm-properties': { padding: '0 0 18px' },
  // The measured shell above owns the block's vertical spacing (padding); the visual
  // box inside it keeps its own border-bottom/padding but must not re-add a margin.
  '.cm-properties > .properties': { margin: '0' },
  // Compound `.cm-line.cm-blockquote` selector beats CodeMirror's own `.cm-line`
  // padding rule (equal specificity, declared later) so the gap actually applies —
  // otherwise text sits flush against the bar. Blockquote: 2px accent bar +
  // 24px padding (§19). Callout colors live in obsidian.css (--callout-* slots).
  '.cm-line.cm-blockquote': {
    borderLeft: '2px solid var(--interactive-accent)',
    paddingLeft: '24px',
    color: 'var(--text-normal)',
  },
  // Markdown tables — mirror Obsidian's table CSS variables
  // (https://docs.obsidian.md/Reference/CSS+variables/Editor/Table): 1px border,
  // left-aligned + top-valigned cells, semibold header with a subtle background.
  // `.cm-lineWrapping` sets `overflow-wrap: anywhere`, which lets the table's
  // auto layout shrink columns below word width ("Own|er", "hun|g"). Restore
  // normal wrapping so columns are at least one word wide; overflow scrolls.
  '.cm-table': { borderCollapse: 'collapse', margin: '0', width: 'auto', overflowWrap: 'normal', wordBreak: 'normal' },
  '.cm-table-scroll': { overflowX: 'auto', maxWidth: '100%' },
  // .cm-content is a flex item of .cm-scroller, so by default it can't shrink
  // below its min-content width — a wide table would widen the whole column
  // (clipping every paragraph on a phone) instead of scrolling in its own box.
  '.cm-content.cm-lineWrapping': { minWidth: '0' },
  '.cm-table th, .cm-table td': {
    border: '1px solid var(--bg-modifier-border)',
    padding: '4px 8px',
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: '1.3',
    position: 'relative',
  },
  '.cm-table th': { fontWeight: '600', background: 'transparent' },
  // Interactive table editor (Obsidian-style): click-to-edit cells + hover controls.
  // `display: block` + `width: fit-content` shrink-wraps the table like the old
  // `inline-block` did, but without the anonymous line box that added ~7px of
  // unmeasurable space below the widget (inline-blocks sit on the text baseline).
  '.cm-table-wrap': {
    position: 'relative',
    display: 'block',
    width: 'fit-content',
    maxWidth: '100%',
    margin: '0 18px 0 0',
    padding: '8px 0 18px',
  },
  '.cm-cell-edit': { outline: 'none', cursor: 'text', minWidth: '1em' },
  '.cm-cell-edit:focus': { boxShadow: 'inset 0 0 0 2px var(--interactive-accent)', background: 'var(--bg-primary)' },
  '.cm-table-addcol, .cm-table-addrow': {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--text-faint)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--bg-modifier-border)',
    borderRadius: '4px',
    opacity: '0',
    fontSize: '14px',
    lineHeight: '1',
    userSelect: 'none',
    transition: 'opacity 0.1s',
  },
  '.cm-table-addcol': { top: '0', right: '-16px', width: '14px', height: '100%' },
  '.cm-table-addrow': { left: '0', bottom: '2px', height: '14px', width: '100%' },
  '.cm-table-wrap:hover .cm-table-addcol, .cm-table-wrap:hover .cm-table-addrow': { opacity: '1' },
  // Column handle (top strip of each header cell) + row handle (left strip of first cell).
  '.cm-col-handle': { position: 'absolute', top: '0', left: '0', right: '0', height: '5px', cursor: 'pointer' },
  '.cm-row-handle': { position: 'absolute', top: '0', bottom: '0', left: '0', width: '5px', cursor: 'pointer' },
  '.cm-col-handle:hover, .cm-row-handle:hover': { background: 'var(--interactive-accent)' },
  '.cm-cell-hl': { background: 'var(--tag-bg)' },
  '.cm-table-addcol:hover, .cm-table-addrow:hover': {
    color: 'var(--text-accent)',
    background: 'var(--bg-modifier-hover)',
    borderColor: 'var(--interactive-accent)',
  },
  // Raw embedded HTML (e.g. CKEditor/Trilium tables) — table metrics match the
  // reading view (4px 10px cells, semibold header) so both modes look alike.
  '.cm-html-block': { margin: '0', padding: '6px 0' },
  '.cm-html-block table': { borderCollapse: 'collapse', margin: '4px 0', width: 'auto' },
  '.cm-html-block th, .cm-html-block td': {
    border: '1px solid var(--bg-modifier-border)',
    padding: '4px 10px',
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: '1.5',
  },
  '.cm-html-block th': { fontWeight: '600', background: 'var(--bg-secondary)' },
  '.cm-html-block ul, .cm-html-block ol': { paddingLeft: '1.4em', margin: '2px 0' },
  '.cm-html-block a': { color: 'var(--text-accent)', textDecoration: 'underline', cursor: 'pointer' },
});
