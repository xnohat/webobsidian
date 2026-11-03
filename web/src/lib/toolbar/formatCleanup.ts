import { EditorSelection, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { COLOR_STYLE_RE } from '../../../../server/src/services/htmlPolicy';

export type InlineAttribute = 'bold' | 'italic' | 'strike' | 'highlight' | 'underline' | 'sup' | 'sub' | 'textColor' | 'backgroundColor';
export type InlineStyles = Partial<Record<InlineAttribute, string | true>>;
export type FormattingResult = { status: 'applied' | 'cancelled' | 'unavailable' };
export interface InlineNode {
  from: number; to: number; text?: string; open?: string; close?: string;
  styles?: InlineStyles; children?: InlineNode[]; opaque?: boolean;
}
const attributes: InlineAttribute[] = ['bold', 'italic', 'strike', 'highlight', 'underline', 'sup', 'sub', 'textColor', 'backgroundColor'];
const markers: [string, InlineAttribute][] = [['**', 'bold'], ['__', 'bold'], ['~~', 'strike'], ['==', 'highlight'], ['*', 'italic'], ['_', 'italic']];

function closing(source: string, marker: string, start: number, end: number): number {
  for (let at = source.indexOf(marker, start); at >= 0 && at < end;) {
    let runEnd = at + marker.length;
    while (runEnd < end && source[runEnd] === marker[0]) runEnd++;
    const length = runEnd - at;
    if (source[at - 1] !== '\\' && !/\s/.test(source[at - 1] ?? '')) {
      if ((marker === '*' || marker === '_') && length % 2 === 0) { at = source.indexOf(marker, runEnd); continue; }
      return marker.length < 3 && (marker[0] === '*' || marker[0] === '_') ? runEnd - marker.length : at;
    }
    at = source.indexOf(marker, runEnd);
  }
  return -1;
}

/** Parse supported inline wrappers; unknown HTML and link destinations stay literal. */
export function parseInline(source: string, from = 0, to = source.length): InlineNode[] {
  const result: InlineNode[] = [];
  let plain = from;
  const push = (node: InlineNode) => {
    if (plain < node.from) result.push({ from: plain, to: node.from, text: source.slice(plain, node.from) });
    result.push(node); plain = node.to;
  };
  for (let at = from; at < to; at++) {
    if (source[at] === '\\') { at++; continue; }
    const rest = source.slice(at, to);
    const code = rest.match(/^(`+)([^]*?)\1/);
    const wiki = rest.match(/^!?\[\[[^\]\n]*\]\]/);
    if (code || wiki) {
      const text = (code ?? wiki)![0];
      push({ from: at, to: at + text.length, text, opaque: true });
      at += text.length - 1; continue;
    }
    const triple = rest.match(/^(\*\*\*|___)/);
    if (triple) {
      const end = closing(source, triple[0], at + 3, to);
      if (end >= 0) {
        push({ from: at, to: end + 3, open: triple[0], close: triple[0], styles: { bold: true, italic: true },
          children: parseInline(source, at + 3, end) });
        at = end + 2; continue;
      }
    }
    const html = rest.match(/^<(u|sup|sub)>|^<span style="([^"]+)">/i);
    if (html && (html[1] || COLOR_STYLE_RE.test(html[2]))) {
      const tag = html[1]?.toLowerCase() ?? 'span';
      const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
      tags.lastIndex = at + html[0].length;
      let depth = 1, end = -1, close = '';
      for (let m = tags.exec(source); m && m.index < to; m = tags.exec(source)) {
        depth += m[0].startsWith('</') ? -1 : 1;
        if (depth === 0) { end = m.index; close = m[0]; break; }
      }
      if (end >= 0) {
        const styles: InlineStyles = {};
        if (tag === 'span') {
          for (const decl of html[2].split(';').filter(Boolean)) {
            const [key, rawValue] = decl.split(':').map(value => value.trim().toLowerCase());
            if (!key || !rawValue) continue;
            const value = rawValue.length === 4 ? '#' + [...rawValue.slice(1)].map(char => char + char).join('') : rawValue;
            styles[key === 'color' ? 'textColor' : 'backgroundColor'] = value;
          }
        } else styles[tag === 'u' ? 'underline' : tag as 'sup' | 'sub'] = true;
        push({ from: at, to: end + close.length, open: html[0], close, styles,
          children: parseInline(source, at + html[0].length, end) });
        at = end + close.length - 1; continue;
      }
    }
    const unknownTag = rest.match(/^<\/?[A-Za-z][^>]*>/);
    if (unknownTag) {
      push({ from: at, to: at + unknownTag[0].length, text: unknownTag[0], opaque: true });
      at += unknownTag[0].length - 1; continue;
    }
    const label = rest.match(/^(!?\[)([^\]\n]*)\]\(/);
    if (label) {
      let depth = 1, end = at + label[0].length;
      for (; end < to && depth; end++) {
        if (source[end] === '\\') { end++; continue; }
        if (source[end] === '(') depth++;
        if (source[end] === ')') depth--;
      }
      if (!depth) {
        const contentFrom = at + label[1].length, contentTo = contentFrom + label[2].length;
        push({ from: at, to: end, open: label[1], close: source.slice(contentTo, end),
          children: parseInline(source, contentFrom, contentTo) });
        at = end - 1; continue;
      }
    }
    for (const [marker, attribute] of markers) {
      if (!rest.startsWith(marker) || /\s/.test(source[at + marker.length] ?? ' ')) continue;
      if (marker.includes('_') && /[\p{L}\p{N}]/u.test(source[at - 1] ?? '')) continue;
      const end = closing(source, marker, at + marker.length, to);
      if (end < 0) continue;
      push({ from: at, to: end + marker.length, open: marker, close: marker,
        styles: { [attribute]: true }, children: parseInline(source, at + marker.length, end) });
      at = end + marker.length - 1; break;
    }
  }
  if (plain < to) result.push({ from: plain, to, text: source.slice(plain, to) });
  return result;
}

export function sliceInline(nodes: InlineNode[], from: number, to: number): InlineNode[] {
  const output: InlineNode[] = [];
  for (const node of nodes) {
    if (node.to <= from || node.from >= to) continue;
    if (node.children) {
      const children = sliceInline(node.children, from, to);
      if (children.length) output.push({ ...node, children });
    } else output.push({ ...node, text: node.text!.slice(Math.max(0, from - node.from), Math.min(node.to, to) - node.from) });
  }
  return output;
}

function styleWrapper(styles: InlineStyles, children: InlineNode[]): InlineNode[] {
  if (!children.length) return [];
  const colors = (['textColor', 'backgroundColor'] as const).filter(key => styles[key]);
  let nodes = children;
  if (colors.length) {
    const style = colors.map(key => `${key === 'textColor' ? 'color' : 'background-color'}:${styles[key]}`).join(';');
    nodes = [{ from: children[0].from, to: children.at(-1)!.to, open: `<span style="${style}">`, close: '</span>',
      styles: Object.fromEntries(colors.map(key => [key, styles[key]])), children: nodes }];
  }
  for (const attr of ['sub', 'sup', 'underline', 'highlight', 'strike', 'italic', 'bold'] as const) {
    if (!styles[attr]) continue;
    const marker = markers.find(([, key]) => key === attr)?.[0];
    const tag = attr === 'underline' ? 'u' : attr;
    nodes = [{ from: children[0].from, to: children.at(-1)!.to, open: marker ?? `<${tag}>`, close: marker ?? `</${tag}>`, styles: { [attr]: true }, children: nodes }];
  }
  return nodes;
}

export function stripInline(nodes: InlineNode[], remove: ReadonlySet<InlineAttribute>): InlineNode[] {
  return nodes.flatMap(node => {
    if (!node.children) return [node];
    const children = stripInline(node.children, remove);
    if (!node.styles) return [{ ...node, children }];
    const retained = Object.fromEntries(Object.entries(node.styles).filter(([key]) => !remove.has(key as InlineAttribute))) as InlineStyles;
    return Object.keys(retained).length === Object.keys(node.styles).length
      ? [{ ...node, children }] : styleWrapper(retained, children);
  });
}

export function wrapInline(nodes: InlineNode[], styles: InlineStyles): InlineNode[] {
  if (!Object.keys(styles).length) return nodes;
  if (nodes.some(node => node.opaque)) return nodes.flatMap(node => node.opaque ? [node] : wrapInline([node], styles));
  if (nodes.length === 1 && nodes[0].styles && Object.keys(nodes[0].styles).every(key => key === 'textColor' || key === 'backgroundColor')) {
    return styleWrapper({ ...nodes[0].styles, ...styles }, nodes[0].children!);
  }
  return styleWrapper(styles, nodes);
}

export function serializeInline(nodes: InlineNode[]): string {
  return nodes.map(node => node.children ? (node.open ?? '') + serializeInline(node.children) + (node.close ?? '') : node.text).join('');
}

export function selectedInlineStyles(nodes: InlineNode[], inherited: InlineStyles = {}): InlineStyles[] {
  return nodes.flatMap(node => node.children ? selectedInlineStyles(node.children, { ...inherited, ...node.styles })
    : !node.opaque && node.text?.length ? [inherited] : []);
}

export function inlinePrefix(text: string): number {
  return text.match(/^[ \t]*(?:>[ \t]*)*(?:(?:#{1,6}|[-+*]|\d+[.)])[ \t]+(?:\[[^\]\r\n]\][ \t]+)?)?/)?.[0].length ?? 0;
}

function protectedLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  let yaml = state.doc.line(1).text === '---', fence: { character: string; length: number } | null = null;
  for (let n = 1; n <= state.doc.lines; n++) {
    const text = state.doc.line(n).text;
    if (yaml) {
      lines.add(n);
      if (n > 1 && /^(?:---|\.\.\.)\s*$/.test(text)) yaml = false;
      continue;
    }
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      lines.add(n);
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (marker) {
      lines.add(n); fence = { character: marker[1][0], length: marker[1].length };
    }
  }
  return lines;
}

/** Batch ranges by line, so disjoint selections inside one wrapper cannot overlap edits. */
export function transformInlineSelection(view: EditorView, transform: (nodes: InlineNode[]) => InlineNode[], useWord = true): boolean {
  const state = view.state;
  if (state.readOnly) return false;
  const selections: {from:number;to:number;reversed:boolean;originalIndices:number[]}[] = [];
  state.selection.ranges.forEach((range, index) => {
    const word = range.empty && useWord ? state.wordAt(range.head) : null;
    const next = { from: word?.from ?? range.from, to: word?.to ?? range.to, reversed: range.anchor > range.head, originalIndices:[index] };
    const previous = selections.at(-1);
    if (previous && previous.to >= next.from) {
      previous.to = Math.max(previous.to, next.to); previous.originalIndices.push(index);
      if (index === state.selection.mainIndex) previous.reversed = next.reversed;
    } else selections.push(next);
  });
  const mainIndex = selections.findIndex(range => range.originalIndices.includes(state.selection.mainIndex));
  const edits: { from: number; to: number; insert: string }[] = [];
  const mapped = selections.map(range => ({ from: range.from, to: range.to }));
  const touched = new Set<number>(), protectedSet = protectedLines(state);
  let delta = 0;
  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo++) {
    if (protectedSet.has(lineNo)) continue;
    const line = state.doc.line(lineNo), prefix = inlinePrefix(line.text);
    const relevant = selections.flatMap((range, index) => {
      const from = Math.max(range.from, line.from + prefix), to = Math.min(range.to, line.to);
      return from < to ? [{ from: from - line.from, to: to - line.from, index }] : [];
    });
    if (!relevant.length) continue;
    const nodes = parseInline(line.text);
    const changedRanges = relevant.flatMap(range => {
      const original = sliceInline(nodes, range.from, range.to), selected = transform(original);
      return serializeInline(original) === serializeInline(selected) ? [] : [{ ...range, selected }];
    });
    if (!changedRanges.length) continue;
    let text = '', cursor = 0;
    for (const range of changedRanges) {
      text += serializeInline(sliceInline(nodes, cursor, range.from));
      const selected = range.selected;
      const selectedText = serializeInline(selected);
      let leading = 0, trailing = 0, outer = selected;
      while (outer.length === 1 && outer[0].styles && outer[0].children) {
        leading += outer[0].open?.length ?? 0; trailing += outer[0].close?.length ?? 0; outer = outer[0].children;
      }
      const outputFrom = line.from + delta + text.length + leading;
      const outputTo = line.from + delta + text.length + selectedText.length - trailing;
      if (selections[range.index].from <= line.to && selections[range.index].from >= line.from) mapped[range.index].from = outputFrom;
      mapped[range.index].to = outputTo;
      touched.add(range.index);
      text += selectedText; cursor = range.to;
    }
    text += serializeInline(sliceInline(nodes, cursor, line.text.length));
    if (text !== line.text) edits.push({ from: line.from, to: line.to, insert: text });
    delta += text.length - line.text.length;
  }
  if (!edits.length) return false;
  const changeSet = state.changes(edits);
  for (let i = 0; i < mapped.length; i++) {
    if (!touched.has(i)) mapped[i] = { from: changeSet.mapPos(mapped[i].from), to: changeSet.mapPos(mapped[i].to) };
  }
  view.dispatch({ changes: edits, selection: EditorSelection.create(mapped.map((range, index) => selections[index].reversed
    ? EditorSelection.range(range.to, range.from) : EditorSelection.range(range.from, range.to)), mainIndex),
    annotations: isolateHistory.of('full'), userEvent: 'input', scrollIntoView: true });
  view.focus();
  return true;
}

export function clearFormatting(ctx: { view: EditorView }): FormattingResult {
  if (ctx.view.state.readOnly) return { status: 'unavailable' };
  return { status: transformInlineSelection(ctx.view, nodes => stripInline(nodes, new Set(attributes))) ? 'applied' : 'cancelled' };
}

export function selectionStyleSamples(state: EditorState): InlineStyles[] {
  const protectedSet = protectedLines(state);
  return state.selection.ranges.flatMap(range => {
    if (range.empty) return [];
    const samples: InlineStyles[] = [];
    for (let n = state.doc.lineAt(range.from).number; n <= state.doc.lineAt(range.to).number; n++) {
      if (protectedSet.has(n)) continue;
      const line = state.doc.line(n);
      samples.push(...selectedInlineStyles(sliceInline(parseInline(line.text), Math.max(range.from - line.from, inlinePrefix(line.text)), Math.min(range.to - line.from, line.text.length))));
    }
    return samples;
  });
}
