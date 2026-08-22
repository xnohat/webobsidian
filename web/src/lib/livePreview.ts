import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { StateField, StateEffect, type EditorState, type Range, type Text } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { CALLOUT_SLOT, CALLOUT_RE, calloutDefaultTitle, calloutIconSvg } from './callouts';
import { openLightbox } from './imageLightbox';
import { VIDEO_EXT_RE, AUDIO_EXT_RE } from './media';

/**
 * Live Preview for CodeMirror 6 — an Obsidian-style WYSIWYG editing mode.
 *
 * Formatting is *rendered* (bold is bold, italic italic, code monospaced, headings
 * sized, links/embeds/checkboxes become widgets) while the raw Markdown syntax is
 * concealed. Syntax for a given span is revealed only when the caret is inside
 * THAT span — not the whole paragraph — so editing one word never dumps raw
 * markup across the line. (PRD FR-2)
 */

let openLink: (target: string) => void = () => {};
export function setLivePreviewLinkHandler(fn: (target: string) => void) {
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
  constructor(readonly target: string, readonly label: string, readonly embed: boolean, readonly aria?: string) {
    super();
  }
  eq(o: WikilinkWidget) {
    return o.target === this.target && o.label === this.label && o.embed === this.embed && o.aria === this.aria;
  }
  toDOM() {
    const a = document.createElement('a');
    a.className = 'cm-hmd-internal-link cm-wikilink internal-link' + (this.embed ? ' embed' : '');
    a.textContent = this.label;
    if (this.aria) a.setAttribute('aria-label', this.aria);
    a.onmousedown = (e) => {
      e.preventDefault();
      openLink(this.target);
    };
    return a;
  }
  ignoreEvent() {
    return false;
  }
}

class MdLinkWidget extends WidgetType {
  constructor(readonly label: string, readonly href: string) {
    super();
  }
  eq(o: MdLinkWidget) {
    return o.label === this.label && o.href === this.href;
  }
  toDOM() {
    const external = /^https?:\/\//i.test(this.href);
    const a = document.createElement('a');
    a.className = 'cm-md-link' + (external ? ' external-link' : ' internal-link');
    a.textContent = this.label;
    a.title = this.href;
    if (external) a.appendChild(externalLinkIcon());
    a.onmousedown = (e) => {
      e.preventDefault();
      if (external) window.open(this.href, '_blank', 'noopener');
      else if (this.href.startsWith('#')) { /* in-note anchor — no-op */ }
      else openLink(this.href.replace(/\.(md|markdown)$/i, ''));
    };
    return a;
  }
  ignoreEvent() {
    return false;
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
function writeImageWidth(view: EditorView, wrap: HTMLElement, width: number): void {
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
  const tokens: Array<{ re: RegExp; build: (m: RegExpExecArray) => string }> = [
    { re: /!\[\[([^\]]+?)\]\]/g, build: (m) => `![[${withSize(m[1].split('|'))}]]` },
    { re: /!\[([^\]]*)\]\(([^)]+)\)/g, build: (m) => `![${withSize(m[1].split('|'))}](${m[2]})` },
  ];
  for (const { re, build } of tokens) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line.text))) {
      if (m.index <= off && off <= m.index + m[0].length) {
        const from = line.from + m.index;
        view.dispatch({ changes: { from, to: from + m[0].length, insert: build(m) } });
        return;
      }
    }
  }
}

class ImageWidget extends WidgetType {
  /** `width`/`height` from the Obsidian size param `![[img|300]]` / `![[img|300x200]]`. */
  constructor(readonly src: string, readonly alt: string, readonly width?: number, readonly height?: number) {
    super();
  }
  eq(o: ImageWidget) {
    return o.src === this.src && o.width === this.width && o.height === this.height;
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

    // Drag-to-resize — left/right edge bars; width is written back as `|W`,
    // keeping aspect ratio (height auto), like Obsidian's image resize.
    const startResize = (e: MouseEvent | TouchEvent, side: 'left' | 'right') => {
      e.preventDefault();
      e.stopPropagation();
      const startX = pointX(e);
      const startW = img.getBoundingClientRect().width;
      const maxW = Math.max(80, view.contentDOM.clientWidth);
      let curW = Math.round(startW);
      wrap.classList.add('is-resizing');
      const onMove = (ev: MouseEvent | TouchEvent) => {
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
        writeImageWidth(view, wrap, curW);
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
  ) {
    super();
  }
  eq(o: MediaWidget) {
    return o.src === this.src && o.kind === this.kind && o.width === this.width;
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
    el.preload = 'metadata';
    el.className = this.kind === 'video' ? 'cm-embed-video media-embed' : 'cm-embed-audio media-embed';
    if (this.kind === 'video' && this.width) (el as HTMLVideoElement).width = this.width;
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
    if (this.fold) {
      const ch = document.createElement('span');
      ch.className = 'cm-callout-fold' + (this.folded ? ' is-folded' : '');
      ch.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      ch.addEventListener('mousedown', (e) => {
        e.preventDefault();
        view.dispatch({ effects: toggleCalloutFold.of(this.titleFrom) });
      });
      span.appendChild(ch);
    }
    return span;
  }
  ignoreEvent(e: Event) {
    return e.type === 'mousedown';
  }
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

class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-math-rendered' + (this.display ? ' math-block' : ' math-inline');
    span.textContent = this.tex; // shown until KaTeX loads
    void ensureKatex().then((katex) => {
      try {
        katex.render(this.tex, span, { throwOnError: false, displayMode: this.display });
      } catch {
        /* keep raw tex */
      }
    });
    return span;
  }
  ignoreEvent() {
    return false;
  }
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

/* ---------------- note embeds (transclusion, like Obsidian ![[note]]) ---------------- */

// Injected from Editor.tsx: resolves a wikilink target and returns rendered,
// sanitized HTML (api.resolve + renderMarkdown — same pipeline as Reading view).
let noteEmbedProvider: (target: string) => Promise<{ html: string } | null> = async () => null;
export function setLivePreviewNoteEmbedProvider(fn: (target: string) => Promise<{ html: string } | null>) {
  noteEmbedProvider = fn;
}

function embedNotFound(el: HTMLElement, target: string) {
  el.classList.add('cm-embed-missing');
  el.textContent = `"${target}" could not be found.`;
}

class NoteEmbedWidget extends WidgetType {
  constructor(readonly target: string) {
    super();
  }
  eq(o: NoteEmbedWidget) {
    return o.target === this.target;
  }
  ignoreEvent() {
    return true;
  }
  toDOM() {
    const box = document.createElement('div');
    box.className = 'internal-embed markdown-embed cm-note-embed';
    const open = document.createElement('span');
    open.className = 'markdown-embed-link';
    open.title = 'Open link';
    open.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
    open.addEventListener('mousedown', (e) => {
      e.preventDefault();
      openLink(this.target);
    });
    // Filename title above the note content, like Obsidian's markdown-embed-title.
    const title = document.createElement('div');
    title.className = 'markdown-embed-title';
    title.textContent = this.target.split('#')[0].split('/').pop() ?? this.target;
    const content = document.createElement('div');
    content.className = 'markdown-embed-content markdown-preview';
    content.textContent = '…';
    box.append(open, title, content);
    void noteEmbedProvider(this.target).then((res) => {
      if (!res) {
        box.textContent = '';
        embedNotFound(box, this.target);
        return;
      }
      content.innerHTML = res.html; // sanitized upstream (rehype-sanitize)
      content.addEventListener('mousedown', (e) => {
        const a = (e.target as HTMLElement).closest('[data-wikilink]') as HTMLElement | null;
        if (!a) return;
        e.preventDefault();
        const t = a.getAttribute('data-wikilink');
        if (t) openLink(t);
      });
    });
    return box;
  }
}

/* ---------------- mermaid (lazy, like Obsidian) ---------------- */

let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null;
function ensureMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: document.querySelector('.theme-dark') ? 'dark' : 'default',
      });
      return m.default;
    });
  }
  return mermaidPromise;
}
let mermaidSeq = 0;

class MermaidWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }
  eq(o: MermaidWidget) {
    return o.code === this.code;
  }
  ignoreEvent() {
    return true;
  }
  toDOM() {
    const div = document.createElement('div');
    div.className = 'mermaid cm-mermaid';
    div.textContent = '…';
    void ensureMermaid()
      .then((mermaid) => mermaid.render(`cm-mmd-${++mermaidSeq}`, this.code))
      .then(({ svg }) => {
        div.innerHTML = svg;
      })
      .catch((err) => {
        div.classList.add('mod-error');
        div.textContent = String(err?.message ?? err);
        // mermaid leaves an orphaned error element in <body> on parse failure
        document.getElementById(`dcm-mmd-${mermaidSeq}`)?.remove();
      });
    return div;
  }
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
      ranges.push(Decoration.replace({ widget: new MermaidWidget(code), block: true }).range(from, to));
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
    btn.textContent = this.rendered ? 'Hide HTML' : 'Render HTML';
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

function buildCalloutFolds(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  let prevIsQuote = false;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const isQuote = QUOTE_LINE_RE.test(line.text);
    if (isQuote && !prevIsQuote) {
      const cm = line.text.replace(QUOTE_MARKERS_RE, '').match(CALLOUT_RE);
      if (cm && cm[2] && isCalloutFolded(state, line.from, cm[2])) {
        let last = n;
        while (last < doc.lines && QUOTE_LINE_RE.test(doc.line(last + 1).text)) last++;
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
          if (!touched) ranges.push(Decoration.replace({ block: true }).range(line.to, to));
          n = last;
          prevIsQuote = false;
          continue;
        }
      }
    }
    prevIsQuote = isQuote;
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
}

// A GFM delimiter row contains only `|`, `-`, `:`, and whitespace. The caller
// also requires at least one `-` and one `|`, which rules out an `---` rule.
const DELIM_RE = /^[\s|:-]+$/;

function splitCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

/** Find GFM/Obsidian tables in the doc: a header row, a delimiter row, then body rows. */
function scanTables(doc: Text): TableBlock[] {
  const out: TableBlock[] = [];
  const total = doc.lines;
  let n = 1;
  while (n < total) {
    const header = doc.line(n);
    const delim = doc.line(n + 1);
    if (
      header.text.includes('|') &&
      delim.text.includes('-') &&
      delim.text.includes('|') &&
      DELIM_RE.test(delim.text)
    ) {
      const headerCells = splitCells(header.text);
      const align: Align[] = splitCells(delim.text).map((c) => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
      });
      const rows: string[][] = [];
      let i = n + 2;
      for (; i <= total; i++) {
        const t = doc.line(i).text;
        if (t.trim() === '' || !t.includes('|')) break;
        rows.push(splitCells(t));
      }
      const from = header.from;
      const to = doc.line(i - 1).to;
      out.push({
        from,
        to,
        key: `${headerCells.join('|')}${align.join(',')}${rows.map((r) => r.join('|')).join('')}`,
        header: headerCells,
        align,
        rows,
      });
      n = i;
      continue;
    }
    n++;
  }
  return out;
}

// Lightweight inline renderer for table cells (code / bold / italic / links).
// `<br>` is the only inline HTML Obsidian commonly renders inside table cells.
const CELL_INLINE_RE =
  /(<br\s*\/?>)|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|(!?\[\[[^\]]+?\]\])|(\[[^\]]+?\]\([^)]+\))/gi;

function appendInline(parent: HTMLElement, text: string) {
  CELL_INLINE_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = CELL_INLINE_RE.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const tok = m[0];
    if (m[1]) {
      parent.appendChild(document.createElement('br'));
    } else if (m[2]) {
      const c = document.createElement('code');
      c.className = 'cm-code';
      c.textContent = tok.slice(1, -1);
      parent.appendChild(c);
    } else if (m[3]) {
      const b = document.createElement('strong');
      b.textContent = tok.slice(2, -2);
      parent.appendChild(b);
    } else if (m[4]) {
      const em = document.createElement('em');
      em.textContent = tok.slice(1, -1);
      parent.appendChild(em);
    } else if (m[5]) {
      const embed = tok.startsWith('!');
      const inner = tok.slice(embed ? 3 : 2, -2);
      const [target, alias] = inner.split('|');
      const a = document.createElement('a');
      a.className = 'cm-wikilink internal-link';
      a.textContent = (alias ?? target).trim();
      a.onmousedown = (e) => {
        e.preventDefault();
        openLink(target.trim());
      };
      parent.appendChild(a);
    } else {
      const lm = /\[([^\]]+?)\]\(([^)]+)\)/.exec(tok)!;
      const href = lm[2].replace(/\s+"[^"]*"$/, '').trim();
      const a = document.createElement('a');
      a.className = 'cm-md-link';
      a.textContent = lm[1];
      a.title = href;
      const external = /^https?:\/\//i.test(href);
      a.onmousedown = (e) => {
        e.preventDefault();
        if (external) window.open(href, '_blank', 'noopener');
        else if (!href.startsWith('#')) openLink(href.replace(/\.(md|markdown)$/i, ''));
      };
      parent.appendChild(a);
    }
    last = CELL_INLINE_RE.lastIndex;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

const ALIGN_DELIM: Record<string, string> = { left: ':---', center: ':---:', right: '---:', '': '---' };

/** Serialize a table model back to GFM markdown. */
function serializeTable(header: string[], align: (Align | '')[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
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

    const table = document.createElement('table');
    table.className = 'cm-table';
    wrap.appendChild(table);

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
      view.dispatch({ changes: { from: b.from, to: b.to, insert: serializeTable(m.header, m.align, m.rows) } });
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
      appendInline(cell, cell.dataset.raw ?? '');
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
      { label: 'Insert column left', icon: 'plus', onClick: () => insertColumn(col) },
      { label: 'Insert column right', icon: 'plus', onClick: () => insertColumn(col + 1) },
      { label: 'Insert row above', icon: 'plus', onClick: () => insertRow(Math.max(0, rowIdx)) },
      { label: 'Insert row below', icon: 'plus', onClick: () => insertRow(rowIdx + 1) },
      { label: '', separator: true },
      { label: 'Move column left', onClick: () => moveColumn(col, col - 1) },
      { label: 'Move column right', onClick: () => moveColumn(col, col + 1) },
      ...(rowIdx >= 0
        ? [
            { label: 'Move row up', onClick: () => moveRow(rowIdx, rowIdx - 1) },
            { label: 'Move row down', onClick: () => moveRow(rowIdx, rowIdx + 1) },
          ]
        : []),
      { label: '', separator: true },
      {
        label: 'Align column',
        icon: 'align-left',
        submenu: [
          { label: 'Left', icon: 'align-left', onClick: () => setAlign(col, 'left') },
          { label: 'Center', icon: 'align-center', onClick: () => setAlign(col, 'center') },
          { label: 'Right', icon: 'align-right', onClick: () => setAlign(col, 'right') },
        ],
      },
      { label: '', separator: true },
      { label: 'Delete column', icon: 'trash-2', onClick: () => deleteColumn(col) },
      ...(rowIdx >= 0 ? [{ label: 'Delete row', icon: 'trash-2', onClick: () => deleteRow(rowIdx) }] : []),
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
      h.title = 'Select / format column';
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
      h.title = 'Select / format row';
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
    addCol.title = 'Add column';
    addCol.textContent = '+';
    addCol.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertColumn(cols);
    });
    const addRow = document.createElement('div');
    addRow.className = 'cm-table-addrow';
    addRow.title = 'Add row';
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

// Strip scripts/handlers/dangerous URLs from raw note HTML before rendering it
// inline (Obsidian renders embedded HTML, e.g. CKEditor/Trilium tables, the same).
const HTML_DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base']);
function sanitizeHtml(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const el of Array.from(tpl.content.querySelectorAll('*'))) {
    if (HTML_DROP_TAGS.has(el.tagName.toLowerCase())) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(attr.name);
      else if ((n === 'href' || n === 'src' || n === 'xlink:href') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return tpl.innerHTML;
}

class HtmlBlockWidget extends WidgetType {
  constructor(readonly html: string) {
    super();
  }
  eq(o: HtmlBlockWidget) {
    return o.html === this.html;
  }
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-html-block';
    div.innerHTML = sanitizeHtml(this.html);
    div.addEventListener('mousedown', (e) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener');
      else if (href && !href.startsWith('#')) openLink(href.replace(/\.(md|markdown)$/i, ''));
    });
    return div;
  }
  ignoreEvent() {
    return false;
  }
}

/** Locate raw HTML blocks (whole-line ranges) via the markdown syntax tree. */
function scanHtmlBlocks(state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const doc = state.doc;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'HTMLBlock') return;
      const fromLine = doc.lineAt(node.from);
      const toLine = doc.lineAt(Math.max(node.from, Math.min(node.to, doc.length) - 1));
      out.push({ from: fromLine.from, to: toLine.to });
    },
  });
  return out;
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
  { label: 'Text', dt: 'text' },
  { label: 'List', dt: 'list' },
  { label: 'Number', dt: 'number' },
  { label: 'Checkbox', dt: 'checkbox' },
  { label: 'Date', dt: 'date' },
  { label: 'Date & time', dt: 'datetime' },
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
    const box = document.createElement('div');
    box.className = 'properties cm-properties';

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
          ic.textContent = TYPE_GLYPH[dt] ?? 'T';
          ic.title = dt;
        }
        const valCell = row.querySelector('.prop-val');
        const oldField = row.querySelector('.prop-val-field') as HTMLElement | null;
        if (valCell && oldField) valCell.replaceChild(makeScalarField(dt, oldField.dataset.raw ?? ''), oldField);
      }
    };

    const propMenu = (key: string, idx: number, curDt: string): LpMenuItem[] => [
      {
        label: 'Property type',
        icon: 'list',
        submenu: PROP_TYPE_OPTIONS.map((o) => ({
          label: (o.dt === curDt ? '✓  ' : '  ') + o.label,
          onClick: () => void setType(key, o.dt),
        })),
      },
      { label: '', separator: true },
      {
        label: 'Copy value',
        icon: 'file-text',
        onClick: () => {
          const p = readProps()[idx];
          if (p) navigator.clipboard.writeText(p.values.join(', ')).catch(() => {});
        },
      },
      { label: '', separator: true },
      { label: 'Remove', icon: 'trash-2', onClick: () => mutate((ps) => ps.splice(idx, 1)) },
    ];

    const props = parseFrontmatter(this.yaml);

    const header = document.createElement('div');
    header.className = 'cm-props-header';
    header.textContent = 'Properties';
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

    // A value editor whose control matches the property type. `dataset.raw` always
    // holds the canonical YAML value so readProps never rewrites untouched fields.
    const makeScalarField = (dt: string, value: string): HTMLElement => {
      const commitChange = () => mutate(() => {});
      if (dt === 'number') {
        const inp = document.createElement('input');
        inp.type = 'number';
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
        inp.type = 'checkbox';
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
        inp.type = dt === 'date' ? 'date' : 'datetime-local';
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
        return inp;
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
      return span;
    };

    // Add an item to a list property via a typed input + suggestion dropdown
    // (vault tags for the `tags` property; free text otherwise), like Obsidian.
    const startAddItem = async (key: string, idx: number, container: HTMLElement, addBtn: HTMLElement) => {
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
      const host = (document.querySelector('.theme-light, .theme-dark') as HTMLElement) ?? document.body;
      host.appendChild(dd);
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

    props.forEach((p, idx) => {
      const dt = displayTypeOf(p);
      const renderAsList = dt === 'list' || p.list;
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.dataset.list = renderAsList ? '1' : '0';

      const icon = document.createElement('span');
      icon.className = 'prop-icon';
      icon.textContent = TYPE_GLYPH[renderAsList ? 'list' : dt] ?? 'T';
      icon.title = renderAsList ? 'list' : dt;

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
          txt.setAttribute('contenteditable', 'true');
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
          x.textContent = '×';
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
        add.textContent = '+';
        add.title = 'Add item';
        add.addEventListener('mousedown', (e) => {
          e.preventDefault();
          void startAddItem(p.key, idx, v, add);
        });
        v.appendChild(add);
      } else {
        v.appendChild(makeScalarField(dt, p.values[0] ?? ''));
      }

      const del = document.createElement('span');
      del.className = 'prop-del';
      del.textContent = '×';
      del.title = 'Delete property';
      del.addEventListener('mousedown', (e) => {
        e.preventDefault();
        mutate((ps) => ps.splice(idx, 1));
      });

      row.append(icon, k, v, del);
      box.appendChild(row);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'cm-props-add';
    addBtn.textContent = '+ Add property';

    // Add a property with a name-suggester dropdown (existing vault keys), like Obsidian.
    const startAdd = async () => {
      addBtn.style.display = 'none';
      const editorRow = document.createElement('div');
      editorRow.className = 'prop-row prop-newrow';
      const icon = document.createElement('span');
      icon.className = 'prop-icon';
      icon.textContent = 'T';
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
          ic.textContent = TYPE_GLYPH[p.type] ?? 'T';
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
    return box;
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

let attachmentUrlProvider = (target: string) =>
  `/api/files/content?path=${encodeURIComponent(target)}`;

export function setLivePreviewAttachmentUrlProvider(provider: (target: string) => string): void {
  attachmentUrlProvider = provider;
}

function attachmentUrl(target: string): string {
  return attachmentUrlProvider(target);
}

function buildDecorations(view: EditorView): DecorationSet {
  const all: Range<Decoration>[] = [];
  const sel = view.state.selection;
  const doc = view.state.doc;

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
  // Block comments: standalone `%%` fence lines toggle a commented region (§7).
  const commentLines = new Set<number>();
  {
    let open = -1;
    for (let n = 1; n <= total; n++) {
      if (doc.line(n).text.trim() === '%%') {
        if (open < 0) {
          open = n;
        } else {
          for (let k = open; k <= n; k++) commentLines.add(k);
          open = -1;
        }
      }
    }
  }
  // Frontmatter range (rendered by frontmatterField) — the regex passes skip it.
  const fmMatch = doc.sliceString(0, Math.min(doc.length, 4000)).match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
  const fmEnd = fmMatch ? fmMatch[0].length : 0;

  // Tables are rendered as block widgets by `tableField`. When a table is shown
  // (selection not inside it) the plugin must NOT decorate inside its range, or
  // its inline replaces would collide with the block widget. Editable tables
  // (selection inside) get normal raw-markdown handling.
  const tables = scanTables(doc);
  const renderedTable = (from: number, to: number) =>
    tables.some((t) => from >= t.from && to <= t.to);

  // Raw HTML blocks are rendered by `htmlBlockField` (block widget). Same rule as
  // tables: skip plugin decorations inside a block that's shown (caret outside).
  const htmlBlocks = scanHtmlBlocks(view.state);
  const renderedHtml = (from: number, to: number) =>
    htmlBlocks.some((h) => from >= h.from && to <= h.to && !touches(h.from, h.to));

  // Inline code and code blocks are literal — wikilink/embed/link/tag syntax
  // inside them must stay raw (e.g. `![[file]]` in backticks is not an embed).
  const codeRanges: { from: number; to: number }[] = [];
  const inCode = (from: number, to: number) => {
    for (const r of codeRanges) if (from < r.to && to > r.from) return true;
    return false;
  };

  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        // Record code spans/blocks so the regex passes below can skip them.
        if (name === 'InlineCode' || name === 'FencedCode' || name === 'CodeBlock') {
          codeRanges.push({ from: node.from, to: node.to });
        }

        // Don't decorate inside a rendered table/HTML block — their fields own it.
        if (renderedTable(node.from, node.to) || renderedHtml(node.from, node.to)) return;

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
          // language from the fence info-string (§7) → flair label top-right
          const lang = doc.line(first).text.match(/^\s*(?:`{3,}|~{3,})[ \t]*([\w/+#-]*)/)?.[1] ?? '';
          for (let i = first; i <= last; i++) {
            const l = doc.line(i);
            const isFence = /^\s*(`{3,}|~{3,})/.test(l.text);
            all.push(
              Decoration.line({
                class:
                  'HyperMD-codeblock HyperMD-codeblock-bg' +
                  (i === first ? ' HyperMD-codeblock-begin' : '') +
                  (i === last ? ' HyperMD-codeblock-end' : ''),
                attributes: i === first && lang ? { 'data-lang': lang } : undefined,
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

  // Regex passes (links, images, wikilinks, tasks, bullets, blockquotes, tags).
  for (const { from, to } of view.visibleRanges) {
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;
    for (let ln = startLine; ln <= endLine; ln++) {
      const line = doc.line(ln);
      const text = line.text;

      // Skip lines covered by a rendered table / HTML block widget.
      if (renderedTable(line.from, line.to) || renderedHtml(line.from, line.to)) continue;
      // Skip the frontmatter block (rendered by frontmatterField).
      if (line.to <= fmEnd) continue;
      // Skip lines fully inside code (fences) — bullets/tags there are literal.
      if (codeRanges.some((r) => r.from <= line.from && r.to >= line.to)) continue;
      // Whole-line %% block comment region → grey out, keep raw.
      if (commentLines.has(ln)) {
        all.push(Decoration.line({ class: 'cm-comment' }).range(line.from, line.from));
        continue;
      }

      // Inline-HTML paragraph line (e.g. `<u>…</u> và <mark>…`): Lezer only marks
      // block-level openers as HTMLBlock, so render whole-line inline HTML here.
      if (/^<[a-zA-Z][^>]*>/.test(text) && !lineActive(line.from)) {
        pushReplace(line.from, line.to, Decoration.replace({ widget: new HtmlBlockWidget(text) }));
        continue;
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
        while (firstLn > 1 && QUOTE_LINE_RE.test(doc.line(firstLn - 1).text)) firstLn--;
        let lastLn = ln;
        while (lastLn < total && QUOTE_LINE_RE.test(doc.line(lastLn + 1).text)) lastLn++;
        const titleLineFrom = doc.line(firstLn).from;
        const firstInner = doc.line(firstLn).text.replace(QUOTE_MARKERS_RE, '');
        const cm = firstInner.match(CALLOUT_RE);
        if (cm) {
          const type = cm[1].split('|')[0].trim().toLowerCase().replace(/\s+/g, '-');
          const slot = CALLOUT_SLOT[type] ?? 'default';
          const attributes = { style: `--callout-color: var(--callout-${slot})` };
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
            bodyStart = markLen; // list handling applies to the rest of the title line
          } else if (!lineActive(line.from)) {
            pushReplace(line.from, line.from + bodyStart, hidden);
          }
        } else {
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
      // Indentation guides for nested lists (one cm-indent per tab / 4-space unit).
      const indentGuides = (ws: string) => {
        let i = 0;
        while (i < ws.length) {
          const end = Math.min(i + (ws[i] === '\t' ? 1 : 4), ws.length);
          all.push(Decoration.mark({ class: 'cm-indent' }).range(bodyFrom + i, bodyFrom + end));
          i = end;
        }
      };
      const task = body.match(/^(\s*)([-*+])\s+\[(.)\]\s/);
      if (task) {
        all.push(
          Decoration.line({
            class: 'HyperMD-list-line HyperMD-task-line',
            attributes: { 'data-task': task[3] },
          }).range(line.from, line.from),
        );
        indentGuides(task[1]);
        const boxPos = bodyFrom + task[1].length + task[2].length + 2;
        if (!touches(line.from, boxPos + 2)) {
          pushReplace(bodyFrom + task[1].length, boxPos + 2, Decoration.replace({ widget: new CheckboxWidget(task[3] !== ' ', boxPos) }));
        }
      } else {
        const bullet = body.match(/^(\s*)([-*+])(\s+)/);
        if (bullet) {
          all.push(Decoration.line({ class: 'HyperMD-list-line' }).range(line.from, line.from));
          indentGuides(bullet[1]);
          // Replace the `-`/`*`/`+` marker with a bullet and collapse its trailing
          // whitespace to a single space, so `-   Item` reads `• Item` like Obsidian.
          const start = bodyFrom + bullet[1].length;
          const markerEnd = start + 1;
          const spaceEnd = markerEnd + bullet[3].length;
          if (!touches(start, spaceEnd)) {
            pushReplace(start, markerEnd, Decoration.replace({ widget: new BulletWidget() }));
            if (bullet[3].length > 1) pushReplace(markerEnd + 1, spaceEnd, hidden);
          }
        } else {
          // Ordered list: keep the `1.` but collapse extra spaces after it.
          const ol = body.match(/^(\s*)(\d{1,9}[.)])(\s+)/);
          if (ol) {
            all.push(Decoration.line({ class: 'HyperMD-list-line' }).range(line.from, line.from));
            indentGuides(ol[1]);
            if (ol[3].length > 1) {
              const markerEnd = bodyFrom + ol[1].length + ol[2].length;
              const spaceEnd = markerEnd + ol[3].length;
              if (!touches(bodyFrom + ol[1].length, spaceEnd)) pushReplace(markerEnd + 1, spaceEnd, hidden);
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

      // %%Comment%% — greyed out (dropped from reading view, visible faint in editor).
      const cmtRe = /%%(.+?)%%/g;
      while ((m = cmtRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (inCode(s, e)) continue;
        all.push(Decoration.mark({ class: 'cm-comment' }).range(s, e));
      }

      // $$Display math$$ (single-line) — rendered via KaTeX when the caret is outside.
      const dmathRe = /\$\$(.+?)\$\$/g;
      while ((m = dmathRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (inCode(s, e)) continue;
        if (!touches(s, e)) pushReplace(s, e, Decoration.replace({ widget: new MathWidget(m[1], true) }));
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
        if (touches(s, e) || inCode(s, e)) continue;
        const inner = m[2];
        if (inner.includes('[[')) continue;
        const isEmbed = m[1] === '!';
        const pi = inner.indexOf('|');
        const href = (pi > 0 ? inner.slice(0, pi) : inner)
          .replace(/\\$/, '')
          .replace(/ /g, ' ')
          .trim()
          .normalize('NFC');
        const alias = pi > 0 ? inner.slice(pi + 1).trim() : null;
        const defaultDisplay = href.split('#').filter(Boolean).join(' > ');
        if (isEmbed && /\.(bmp|png|jpe?g|gif|svg|webp|avif)$/i.test(href)) {
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
          pushReplace(s, e, Decoration.replace({ widget: new ImageWidget(attachmentUrl(href), href, w, h) }));
        } else if (isEmbed && (VIDEO_EXT_RE.test(href) || AUDIO_EXT_RE.test(href))) {
          // `![[clip.mp4]]` / `![[song.mp3]]` → native HTML5 player like Obsidian.
          const kind = VIDEO_EXT_RE.test(href) ? 'video' : 'audio';
          // width param (video only): last `|` segment `300` / `300x200`
          let w: number | undefined;
          if (kind === 'video' && pi > 0) {
            const segs = inner.split('|');
            const sm = segs[segs.length - 1].match(/^\s*([0-9]+)\s*(?:x\s*[0-9]+\s*)?$/);
            if (sm) w = Number(sm[1]);
          }
          pushReplace(s, e, Decoration.replace({ widget: new MediaWidget(attachmentUrl(href), href, kind, w) }));
        } else if (isEmbed && !/\.[a-z0-9]{1,5}$/i.test(href.split('#')[0])) {
          // `![[note]]` (no binary extension) → real transclusion like Obsidian.
          pushReplace(s, e, Decoration.replace({ widget: new NoteEmbedWidget(href) }));
        } else {
          // LP shows the raw target text (`Note#Head`); the `Note > Head` display
          // form is reading-view behaviour and goes into aria-label like Obsidian.
          const label = alias || href;
          pushReplace(
            s,
            e,
            Decoration.replace({ widget: new WikilinkWidget(href, label, isEmbed, defaultDisplay !== label ? defaultDisplay : undefined) }),
          );
        }
      }

      // Markdown images ![alt](url) — URL may contain spaces (real-world vaults)
      const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
      while ((m = imgRe.exec(text))) {
        const s = line.from + m.index;
        const e = s + m[0].length;
        if (touches(s, e) || inCode(s, e)) continue;
        // size param lives in the alt text: `![alt|300](url)` / `![|300x200](url)`
        let alt = m[1];
        let w: number | undefined;
        let h: number | undefined;
        const ai = alt.lastIndexOf('|');
        if (ai >= 0) {
          const sm = alt.slice(ai + 1).match(/^\s*([0-9]+)\s*(?:x\s*([0-9]+)\s*)?$/);
          if (sm) {
            w = Number(sm[1]);
            h = sm[2] ? Number(sm[2]) : undefined;
            alt = alt.slice(0, ai);
          }
        }
        const url = m[2].replace(/\s+"[^"]*"$/, '').trim();
        // Browser-loadable URLs load directly; anything else (a relative path or
        // any custom scheme) is resolved by basename via the vault file index.
        const webLoadable = /^(https?|data|blob|file):/i.test(url);
        const src = webLoadable ? url : attachmentUrl(url.split('/').pop() || url);
        pushReplace(s, e, Decoration.replace({ widget: new ImageWidget(src, alt, w, h) }));
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

  return Decoration.set(all, true);
}

/* ---------------- frontmatter (block widget; needs a StateField) ---------------- */

function buildFrontmatter(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const text = state.doc.sliceString(0, Math.min(state.doc.length, 4000));
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!fm) return Decoration.none;
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
  const title = state.field(noteTitleField, false) ?? '';
  if (!title) return Decoration.none;
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
  const tables = scanTables(state.doc);
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
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setLivePreviewEnabled) || e.is(setLivePreviewReadonly))) {
      return buildTables(tr.state);
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---------------- raw HTML blocks (block widgets; need a StateField) ---------------- */

function buildHtmlBlocks(state: EditorState): DecorationSet {
  if (!state.field(livePreviewState, false)) return Decoration.none;
  const blocks = scanHtmlBlocks(state);
  if (!blocks.length) return Decoration.none;
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
    constructor(view: EditorView) {
      this.decorations = view.state.field(livePreviewState) ? buildDecorations(view) : Decoration.none;
    }
    update(u: ViewUpdate) {
      if (!u.state.field(livePreviewState)) {
        this.decorations = Decoration.none;
        return;
      }
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.transactions.some((t) => t.effects.length)) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Make a single click land the caret exactly where the user clicked, so the
 * clicked line becomes "active" and its concealed markup reveals immediately.
 * Tall heading line-boxes and the focus-gaining click on a contenteditable can
 * otherwise swallow the first click, which is why editing a heading "took
 * several clicks". We only act on a plain click (no shift = not range-extending)
 * and let CodeMirror still handle drag-select normally.
 */
export const editorClickFix = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || event.shiftKey || event.detail > 1) return false;
    // `precise: false` returns the CLOSEST position and never null, so clicking
    // anywhere on a tall heading line-box (incl. its padding, where the default
    // posAtCoords returns null and CM leaves the caret put) still moves the caret
    // onto that line — which reveals its concealed markup on the first click.
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    view.dispatch({ selection: { anchor: pos } });
    return false; // let CodeMirror handle focus/drag normally too
  },
});

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
    margin: '0 0 0.5em',
    padding: '0',
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
  '.cm-embed-image': { maxWidth: '100%', borderRadius: '6px', display: 'block', margin: '6px 0' },
  '.cm-properties': { margin: '4px 0 18px' },
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
  '.cm-table': { borderCollapse: 'collapse', margin: '0', width: 'auto' },
  '.cm-table th, .cm-table td': {
    border: '1px solid var(--bg-modifier-border)',
    padding: '4px 10px',
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: '1.5',
    position: 'relative',
  },
  '.cm-table th': { fontWeight: '600', background: 'var(--bg-secondary)' },
  // Interactive table editor (Obsidian-style): click-to-edit cells + hover controls.
  '.cm-table-wrap': { position: 'relative', display: 'inline-block', margin: '8px 18px 18px 0' },
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
  '.cm-table-addrow': { left: '0', bottom: '-16px', height: '14px', width: '100%' },
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
  '.cm-html-block': { margin: '6px 0' },
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
