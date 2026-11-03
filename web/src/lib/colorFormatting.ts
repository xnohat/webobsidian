import type { EditorView } from '@codemirror/view';
import { stripInline, transformInlineSelection, wrapInline } from './toolbar/formatCleanup';

export type ColorProperty = 'color' | 'background-color';
// Shared with the Markdown sanitizer: no arbitrary CSS or URLs are admitted.
export { COLOR_STYLE_RE } from '../../../server/src/services/htmlPolicy';

export function applyColor(view: EditorView, property: ColorProperty, color: string | null): boolean {
  if (view.state.readOnly || (property !== 'color' && property !== 'background-color')) return false;
  if (color !== null && !/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) return false;
  if (color?.length === 4) color = '#' + [...color.slice(1)].map(c => c + c).join('');
  color = color?.toLowerCase() ?? null;
  const key = property === 'color' ? 'textColor' : 'backgroundColor';
  return transformInlineSelection(view, nodes => {
    const stripped = stripInline(nodes, new Set([key]));
    return color === null ? stripped : wrapInline(stripped, { [key]: color });
  });
}
