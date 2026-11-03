import { CALLOUT_RE, calloutTypeSlot, calloutDefaultTitle } from './markdownCallouts.js';

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
  position?: { start: { offset?: number }; end: { offset?: number } };
}

export function remarkTableCodeEscapes() {
  return (tree: MdNode, file: { value: unknown }) => {
    const source = String(file.value);
    const visit = (node: MdNode, inTable = false) => {
      inTable ||= node.type === 'table';
      if (inTable && node.type === 'inlineCode' && node.position) {
        const raw = source.slice(node.position.start.offset, node.position.end.offset);
        const match = raw.match(/^(`+)([\s\S]*?)\1$/);
        if (match) {
          const value = match[2].replace(/\r?\n/g, ' ');
          node.value = /^ .* $/.test(value) && /\S/.test(value) ? value.slice(1,-1) : value;
        }
      }
      node.children?.forEach(child => visit(child, inTable));
    };
    visit(tree);
  };
}

interface HtmlNode {
  tagName?: string;
  properties?: Record<string, unknown>;
  type?: string;
  value?: string;
  children?: HtmlNode[];
}
let footnoteRenderId = 0;
export function rehypeFootnoteLabels() {
  return (tree: HtmlNode) => {
    const prefix = `wo-footnote-${++footnoteRenderId}-`;
    const ids = new Map<string, string>();
    let count = 0;
    const collect = (node: HtmlNode, inFootnotes = false) => {
      inFootnotes ||= node.properties?.dataFootnotes !== undefined;
      if ((inFootnotes || node.properties?.dataFootnoteRef !== undefined) && typeof node.properties?.id === 'string') {
        const id = node.properties.id;
        const replacement = `${prefix}${count++}`;
        ids.set(id, replacement);
        // remark-rehype protects its generated IDs, then sanitize adds its own
        // prefix. Repair only generated footnote targets, retaining sanitization.
        if (id.startsWith('user-content-')) ids.set(id.slice('user-content-'.length), replacement);
        node.properties.id = replacement;
      }
      node.children?.forEach(child => collect(child, inFootnotes));
    };
    collect(tree);
    const visit = (node: HtmlNode) => {
      const props = node.properties;
      if (typeof props?.href === 'string' && props.href.startsWith('#')) {
        const replacement = ids.get(props.href.slice(1));
        if (replacement) props.href = `#${replacement}`;
      }
      if (Array.isArray(props?.ariaDescribedBy)) props.ariaDescribedBy = props.ariaDescribedBy.map(id => ids.get(String(id)) ?? id);
      if (node.tagName === 'a' && node.properties?.dataFootnoteRef !== undefined) {
        const label = node.children?.map(n => n.value ?? '').join('') ?? '';
        node.children = [{ type: 'text', value: /^\[.*\]$/.test(label) ? label : `[${label}]` }];
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/** Soft breaks are visible by default in Obsidian; strict mode uses CommonMark. */
export function remarkSoftBreaks(options: { strictLineBreaks?: boolean } = {}) {
  return (tree: MdNode) => {
    if (options.strictLineBreaks) return;
    const visit = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value?.includes('\n')) return [child];
        return child.value.split(/\r?\n/).flatMap((value, index) =>
          index ? [{ type: 'break' }, { type: 'text', value }] : [{ type: 'text', value }]);
      });
      node.children.forEach(visit);
    };
    visit(tree);
  };
}

/** Process actual blockquotes, so nesting and formatted titles retain their AST. */
export function remarkCallouts() {
  return (tree: MdNode) => {
    const visit = (node: MdNode) => {
      node.children?.forEach(visit);
      if (node.type !== 'blockquote') return;
      const first = node.children?.[0];
      const text = first?.children?.[0];
      const match = first?.type === 'paragraph' && text?.type === 'text' ? text.value?.match(CALLOUT_RE) : null;
      if (!match || !first?.children || !text) return;
      const { type, slot } = calloutTypeSlot(match[1]);
      text.value = text.value!.slice(match[0].length);
      const title: MdNode[] = [], body: MdNode[] = [];
      let after = false;
      for (const child of first.children) {
        if (!after && child.type === 'break') { after = true; continue; }
        const newline = !after && child.type === 'text' ? child.value?.indexOf('\n') ?? -1 : -1;
        if (newline >= 0) {
          title.push({ ...child, value: child.value!.slice(0, newline) });
          body.push({ ...child, value: child.value!.slice(newline + 1) });
          after = true;
        } else (after ? body : title).push(child);
      }
      const content = [...(body.length ? [{ type: 'paragraph', children: body }] : []), ...node.children!.slice(1)];
      const titleNodes = title.some(n => n.type !== 'text' || n.value?.trim()) ? title : [{ type: 'text', value: calloutDefaultTitle(type) }];
      const div = (className: string, children: MdNode[]): MdNode => ({ type: 'blockquote', data: { hName: 'div', hProperties: { className } }, children });
      node.data = { hName: 'div', hProperties: { className: `callout${match[2] === '-' ? ' is-collapsed' : ''}`, dataCallout: type, dataCalloutFold: match[2] } };
      node.children = [div('callout-title', [
        { type: 'paragraph', data: { hName: 'span', hProperties: { className: 'callout-icon', dataCalloutIcon: slot } }, children: [] },
        { type: 'paragraph', data: { hName: 'span', hProperties: { className: 'callout-title-inner' } }, children: titleNodes },
      ]), div('callout-content', content)];
    };
    visit(tree);
  };
}

/** Called on protected source only; code/HTML/escaped brackets are opaque tokens. */
export function expandInlineFootnotes(source: string): string {
  let prefix = 'obsidian-inline-';
  while (source.includes(prefix)) prefix += 'x';
  const definitions: string[] = [];
  let result = '', cursor = 0;
  for (const { from: i, to, body } of inlineFootnoteRanges(source)) {
    const id = `${prefix}${definitions.length + 1}`;
    result += source.slice(cursor, i) + `[^${id}]`;
    definitions.push(`[^${id}]: ${body}`);
    cursor = to;
  }
  return result + source.slice(cursor) + (definitions.length ? '\n\n' + definitions.join('\n\n') : '');
}

export function inlineFootnoteRanges(source: string): { from: number; to: number; body: string }[] {
  const ranges: { from: number; to: number; body: string }[] = [];
  for (let i = 0; i < source.length - 1; i++) {
    if (source[i] !== '^' || source[i + 1] !== '[') continue;
    let depth = 1, end = i + 2;
    for (; end < source.length && source[end] !== '\n'; end++) {
      if (source[end] === '[') depth++;
      if (source[end] === ']' && --depth === 0) break;
    }
    if (depth !== 0 || end === i + 2) continue;
    ranges.push({ from: i, to: end + 1, body: source.slice(i + 2, end) });
    i = end;
  }
  return ranges;
}
