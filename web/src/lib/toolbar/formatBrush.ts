import type { EditorView } from '@codemirror/view';
import { selectionStyleSamples, stripInline, transformInlineSelection, wrapInline, type FormattingResult, type InlineAttribute, type InlineStyles } from './formatCleanup';

export type FormatOperation<T> = { kind: 'set'; value: T } | { kind: 'clear' } | { kind: 'keep' };
export interface FormatSnapshot {
  bold: FormatOperation<true>; italic: FormatOperation<true>; strike: FormatOperation<true>;
  highlight: FormatOperation<true>; underline: FormatOperation<true>; sup: FormatOperation<true>; sub: FormatOperation<true>;
  textColor: FormatOperation<string>; backgroundColor: FormatOperation<string>;
}
const attributes: InlineAttribute[] = ['bold', 'italic', 'strike', 'highlight', 'underline', 'sup', 'sub', 'textColor', 'backgroundColor'];

export function captureFormat(ctx: { view: EditorView }): FormatSnapshot | null {
  const samples = selectionStyleSamples(ctx.view.state);
  if (!samples.length) return null;
  return Object.fromEntries(attributes.map(key => {
    const first = samples[0][key];
    return [key, samples.every(sample => sample[key] === first)
      ? first === undefined ? { kind: 'clear' } : { kind: 'set', value: first }
      : { kind: 'keep' }];
  })) as unknown as FormatSnapshot;
}

export function applyFormat(ctx: { view: EditorView }, format: FormatSnapshot): FormattingResult {
  if (ctx.view.state.readOnly) return { status: 'unavailable' };
  const remove = new Set<InlineAttribute>(), styles: InlineStyles = {};
  for (const key of attributes) {
    const operation = format[key];
    if (operation.kind !== 'keep') remove.add(key);
    if (operation.kind === 'set') styles[key] = operation.value;
  }
  if (styles.sup) { remove.add('sub'); delete styles.sub; }
  else if (styles.sub) remove.add('sup');
  return { status: transformInlineSelection(ctx.view, nodes => wrapInline(stripInline(nodes, remove), styles)) ? 'applied' : 'cancelled' };
}
