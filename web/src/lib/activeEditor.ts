import type { EditorView } from '@codemirror/view';
import { undo, redo, indentMore, indentLess } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { toggleInline, toggleChecklist, insertLink } from './editorCommands';
import {invalidateContext} from './toolbar/registry';

/**
 * Module-level handle to the currently-mounted CodeMirror editor, so UI outside
 * the editor (e.g. the mobile formatting toolbar) can dispatch commands without
 * threading a ref through React. The Editor registers/clears it on mount/unmount.
 */
let active: EditorView | null = null;

export function setActiveEditor(v: EditorView | null) {
  if(active && active!==v) invalidateContext(active);
  active = v;
}
export function getActiveEditor(): EditorView | null {
  return active;
}

/** Wrap the selection (or word at caret) in a pair of marks; unwrap if already wrapped. */
export function fmtInline(mark: string, view = active) {
  if (view && !view.state.readOnly) toggleInline(view, mark);
}

/** Toggle a task checkbox / continue checklist on the selected lines. */
export function fmtChecklist(view = active) {
  if (view && !view.state.readOnly) toggleChecklist(view);
}

/** Prefix each selected line with `prefix` (heading, bullet, quote…). */
export function fmtPrefixLines(prefix: string, v = active) {
  if (!v || v.state.readOnly) return;
  const { from, to } = v.state.selection.main;
  const a = v.state.doc.lineAt(from).number;
  const b = v.state.doc.lineAt(to).number;
  const changes = [];
  for (let n = a; n <= b; n++) changes.push({ from: v.state.doc.line(n).from, insert: prefix });
  v.dispatch({ changes, userEvent: 'input' });
  v.focus();
}

/** Insert text at the caret; place caret `caretOffset` chars in (default end). */
export function fmtInsert(text: string, caretOffset = text.length, v = active) {
  if (!v || v.state.readOnly) return;
  const { from, to } = v.state.selection.main;
  v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + caretOffset }, userEvent: 'input' });
  v.focus();
}

export function fmtLink(view = active) {
  if (view && !view.state.readOnly) insertLink(view);
}
export function fmtIndent(view = active) {
  if (view && !view.state.readOnly) { indentMore(view); view.focus(); }
}
export function fmtOutdent(view = active) {
  if (view && !view.state.readOnly) { indentLess(view); view.focus(); }
}
export function fmtUndo(view = active) {
  if (view && !view.state.readOnly) { undo(view); view.focus(); }
}
export function fmtRedo(view = active) {
  if (view && !view.state.readOnly) { redo(view); view.focus(); }
}

/** Open the in-document Find/Replace panel (CM6 search panel includes both). */
export function editorFind(): boolean {
  if (!active) return false;
  openSearchPanel(active);
  return true;
}
