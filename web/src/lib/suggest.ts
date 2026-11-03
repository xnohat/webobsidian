import { EditorView, ViewPlugin, ViewUpdate, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { prepareQuery, fuzzySearch, fuzzySearchPath, type FuzzyMatch } from './fuzzy';
import { themedPopupHost } from './theme';
import { formatInternalLink, isUserIgnored } from './vaultLinks';
import { getCachedVaultPreferences } from './vaultPreferences';
import { isSupportedVaultFile } from './media';
import { useStore } from './store';

/**
 * Editor suggesters (docs §9):
 *  - `[[` link suggester — trigger when lastIndexOf("[[") > lastIndexOf("]") on the
 *    line text up to the cursor; `![[` works the same. Stops in display-text mode (`|`).
 *  - `#` tag suggester — trigger on /(^|\s)#…$/ before the cursor.
 * Ranking uses the exact Obsidian fuzzy score (lib/fuzzy.ts). Max 20 items.
 */

let linkFiles: () => string[] = () => [];
export function setLinkSuggestFiles(fn: () => string[]) {
  linkFiles = fn;
}
let vaultTags: () => string[] = () => [];
export function setTagSuggestTags(fn: () => string[]) {
  vaultTags = fn;
}

// Tag body charset (§7) — editor flavour additionally requires a letter.
const TAG_TAIL_RE = /(^|\s)#([^ -⁯⸀-⹿'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s]*)$/;

interface Item {
  label: string; // main text (basename / tag)
  note?: string; // secondary text (folder path)
  insert: string; // text replacing the query
  match: FuzzyMatch;
  path?: string;
  ignored?: boolean;
}

interface Ctx {
  mode: 'link' | 'tag';
  embed: boolean;
  from: number; // start of the query text (after the trigger)
  query: string;
}

function detect(view: EditorView): Ctx | null {
  const sel = view.state.selection.main;
  if (!sel.empty) return null;
  const line = view.state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);

  const ob = before.lastIndexOf('[[');
  const cb = before.lastIndexOf(']');
  if (ob >= 0 && ob > cb) {
    const q = before.slice(ob + 2);
    // display-text / heading / block modes end basic file suggestions
    if (!q.includes('|') && !q.includes('#') && !q.includes('\n')) {
      return { mode: 'link', embed: ob > 0 && before[ob - 1] === '!', from: line.from + ob + 2, query: q };
    }
    return null;
  }

  const tm = before.match(TAG_TAIL_RE);
  if (tm) {
    const after = line.text[sel.head - line.from];
    if (after !== '#') {
      const start = sel.head - tm[2].length;
      return { mode: 'tag', embed: false, from: start, query: tm[2] };
    }
  }
  return null;
}

function computeItems(ctx: Ctx): Item[] {
  const pq = prepareQuery(ctx.query);
  const out: Item[] = [];
  if (ctx.mode === 'link') {
    const preferences = getCachedVaultPreferences().values;
    for (const path of linkFiles()) {
      if (!preferences.showUnsupportedFiles && !isSupportedVaultFile(path,useStore.getState().codeFileViewer)) continue;
      const target = path.replace(/\.md$/i, '');
      const m = ctx.query ? fuzzySearchPath(pq, target) : { score: 0, matches: [] as [number, number][] };
      if (!m) continue;
      const slash = target.lastIndexOf('/');
      out.push({
        label: slash >= 0 ? target.slice(slash + 1) : target,
        note: slash >= 0 ? target.slice(0, slash) : undefined,
        insert: target,
        match: m,
        path,
        ignored: isUserIgnored(path, preferences.userIgnoreFilters),
      });
    }
  } else {
    for (const tag of vaultTags()) {
      const m = ctx.query ? fuzzySearch(pq, tag) : { score: 0, matches: [] as [number, number][] };
      if (!m) continue;
      out.push({ label: tag, insert: tag, match: m });
    }
  }
  out.sort((x, y) => Number(x.ignored ?? false) - Number(y.ignored ?? false) || y.match.score - x.match.score);
  return out.slice(0, 20);
}

/** Bold the matched ranges of `label` (suggestion-highlight). */
function renderLabel(el: HTMLElement, label: string, item: Item) {
  // matches are in target coordinates; map to the label when it's a suffix (basename)
  const offset = item.insert.length - label.length;
  let last = 0;
  for (const [a, b] of item.match.matches) {
    const from = Math.max(0, a - offset);
    const to = Math.max(0, b - offset);
    if (to <= 0 || from >= label.length || to <= from) continue;
    if (from > last) el.appendChild(document.createTextNode(label.slice(last, from)));
    const hl = document.createElement('span');
    hl.className = 'suggestion-highlight';
    hl.textContent = label.slice(from, to);
    el.appendChild(hl);
    last = to;
  }
  if (last < label.length) el.appendChild(document.createTextNode(label.slice(last)));
}

class SuggestState {
  dom: HTMLElement | null = null;
  ctx: Ctx | null = null;
  items: Item[] = [];
  selected = 0;

  constructor(readonly view: EditorView) {}

  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet || u.focusChanged) {
      // defer: coordsAtPos must run after the view finishes updating
      requestAnimationFrame(() => this.refresh());
    }
  }

  refresh() {
    const view = this.view;
    if (!view.hasFocus) return this.hide();
    const ctx = detect(view);
    if (!ctx) return this.hide();
    this.ctx = ctx;
    this.items = computeItems(ctx);
    this.selected = 0;
    if (!this.items.length) return this.hide();
    this.show();
  }

  show() {
    const view = this.view;
    if (!this.dom) {
      this.dom = document.createElement('div');
      this.dom.className = 'suggestion-container';
      // Mount inside the themed root (never `<body>`): the popup's CSS reads palette
      // variables, which are declared on that wrapper — off it, the text renders black
      // on the dark themes (see `themedPopupHost`).
      themedPopupHost().appendChild(this.dom);
    }
    const dom = this.dom;
    dom.textContent = '';
    this.items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'suggestion-item' + (i === this.selected ? ' is-selected' : '');
      const title = document.createElement('span');
      title.className = 'suggestion-title';
      renderLabel(title, item.label, item);
      el.appendChild(title);
      if (item.note) {
        const note = document.createElement('span');
        note.className = 'suggestion-note';
        note.textContent = item.note;
        el.appendChild(note);
      }
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.selected = i;
        this.accept();
      });
      el.addEventListener('mousemove', () => {
        if (this.selected !== i) {
          this.selected = i;
          this.renderSelection();
        }
      });
      dom.appendChild(el);
    });
    const ctx = this.ctx!;
    const coords = view.coordsAtPos(ctx.from - (ctx.mode === 'link' ? 2 : 1));
    if (!coords) return this.hide();
    dom.style.left = `${Math.round(Math.min(coords.left, window.innerWidth - 320))}px`;
    dom.style.display = 'block';
    // Flip above the cursor when there is no room below (like Obsidian).
    const height = Math.min(dom.scrollHeight, 300);
    if (coords.bottom + 4 + height > window.innerHeight && coords.top - 4 - height > 0) {
      dom.style.top = `${Math.round(coords.top - 4 - height)}px`;
    } else {
      dom.style.top = `${Math.round(coords.bottom + 4)}px`;
    }
  }

  renderSelection() {
    if (!this.dom) return;
    [...this.dom.children].forEach((c, i) => c.classList.toggle('is-selected', i === this.selected));
    (this.dom.children[this.selected] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }

  hide() {
    this.ctx = null;
    if (this.dom) {
      this.dom.remove();
      this.dom = null;
    }
  }

  get active() {
    return this.dom !== null && this.ctx !== null && this.items.length > 0;
  }

  accept() {
    const ctx = this.ctx;
    const item = this.items[this.selected];
    if (!ctx || !item) return;
    const view = this.view;
    const head = view.state.selection.main.head;
    if (ctx.mode === 'link') {
      // consume a `]]` the user (or auto-pair) already typed after the cursor
      const after = view.state.sliceDoc(head, head + 2);
      const extra = after === ']]' ? 2 : 0;
      const insert = formatInternalLink({ sourcePath: useStore.getState().activePath, targetPath: item.path!, embed: ctx.embed, preferences: getCachedVaultPreferences().values, knownPaths: linkFiles() });
      const from = ctx.from - (ctx.embed ? 3 : 2);
      view.dispatch({
        changes: { from, to: head + extra, insert },
        selection: { anchor: from + insert.length },
        userEvent: 'input.complete',
      });
    } else {
      view.dispatch({
        changes: { from: ctx.from, to: head, insert: item.insert },
        selection: { anchor: ctx.from + item.insert.length },
        userEvent: 'input.complete',
      });
    }
    this.hide();
    view.focus();
  }

  move(dir: 1 | -1) {
    this.selected = (this.selected + dir + this.items.length) % this.items.length;
    this.renderSelection();
  }

  destroy() {
    this.hide();
  }
}

const plugin = ViewPlugin.fromClass(SuggestState, {
  eventHandlers: {
    blur() {
      const self = this as unknown as SuggestState;
      // let an item mousedown win first
      setTimeout(() => self.hide(), 120);
      return false;
    },
  },
});

/** Run `f` when the suggester popup is open; otherwise let the key fall through. */
function whenActive(view: EditorView, f: (s: SuggestState) => void): boolean {
  const s = view.plugin(plugin);
  if (!s || !s.active) return false;
  f(s);
  return true;
}

// Highest precedence so Enter/Tab/arrows beat the editor keymaps while open.
const suggesterKeys = Prec.highest(
  keymap.of([
    { key: 'ArrowDown', run: (v) => whenActive(v, (s) => s.move(1)) },
    { key: 'ArrowUp', run: (v) => whenActive(v, (s) => s.move(-1)) },
    { key: 'Enter', run: (v) => whenActive(v, (s) => s.accept()) },
    { key: 'Tab', run: (v) => whenActive(v, (s) => s.accept()) },
    { key: 'Escape', run: (v) => whenActive(v, (s) => s.hide()) },
  ]),
);

export const suggesterPlugin = [plugin, suggesterKeys];
