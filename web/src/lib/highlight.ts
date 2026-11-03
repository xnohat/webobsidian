import { HighlightStyle, syntaxTree } from '@codemirror/language';
import { Decoration, ViewPlugin, type EditorView, type DecorationSet } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/**
 * Obsidian-style syntax colors (docs §19, "Variable editor/markdown"):
 * comment=faint, function=yellow, keyword=pink, string=green, operator/tag=red,
 * property=cyan, value/number=purple, important=orange. Colors are CSS variables
 * so the same style serves light & dark.
 *
 * Deliberately does NOT style markdown structure tags (emphasis, heading, link,
 * escape…) — Live Preview decorations own those. This is what fixes stray red
 * escapes/brackets that defaultHighlightStyle painted in body text.
 */
export const obsidianHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--text-faint)' },
  { tag: t.lineComment, color: 'var(--text-faint)' },
  { tag: t.blockComment, color: 'var(--text-faint)' },
  { tag: t.docComment, color: 'var(--text-faint)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: 'var(--color-yellow)' },
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--color-pink)' },
  { tag: [t.string, t.special(t.string), t.character, t.regexp], color: 'var(--color-green)' },
  { tag: [t.operator, t.tagName, t.angleBracket, t.derefOperator], color: 'var(--color-red)' },
  { tag: [t.propertyName, t.attributeName, t.definition(t.variableName)], color: 'var(--color-cyan)' },
  { tag: [t.number, t.bool, t.atom, t.null, t.unit, t.color, t.constant(t.variableName)], color: 'var(--color-purple)' },
  { tag: [t.annotation, t.self, t.changed], color: 'var(--color-orange)' },
  { tag: [t.className, t.namespace, t.typeName], color: 'var(--color-cyan)' },
  { tag: t.meta, color: 'var(--color-orange)' },
  { tag: t.invalid, color: 'var(--text-error, var(--color-red))' },
]);

/** Underscore identifiers in angle brackets are text, not colored HTML tags. */
function literalAngleDecorations(view: EditorView): DecorationSet {
  const code: { from: number; to: number }[] = [];
  syntaxTree(view.state).iterate({ enter(node) {
    if (['InlineCode', 'FencedCode', 'CodeBlock'].includes(node.name)) {
      code.push({ from: node.from, to: node.to });
      return false;
    }
  } });
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    for (const match of text.matchAll(/<\/?([A-Za-z][A-Za-z0-9_-]*)\s*>/g)) {
      if (!match[1].includes('_')) continue;
      const start = from + match.index!, end = start + match[0].length;
      if (code.some(r => start < r.to && end > r.from)) continue;
      ranges.push(Decoration.mark({ class: 'cm-literal-angle' }).range(start, end));
    }
  }
  return Decoration.set(ranges, true);
}

export const literalAngleColors = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = literalAngleDecorations(view); }
  update(update: import('@codemirror/view').ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.transactions.some(t => t.effects.length)) {
      this.decorations = literalAngleDecorations(update.view);
    }
  }
}, { decorations: plugin => plugin.decorations });
