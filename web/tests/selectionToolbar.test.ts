import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorState } from '@codemirror/state';
import { showTooltip } from '@codemirror/view';
import { selectionToolbar, dismissSelectionToolbar } from '../src/lib/selectionToolbar';

test('floating toolbar follows selection, dismisses with Escape and hides on read-only transitions', () => {
  let state = EditorState.create({ doc: 'hello world', extensions: [selectionToolbar] });
  const visible = () => state.facet(showTooltip).filter(Boolean);
  assert.equal(visible().length, 0);
  state = state.update({ selection: { anchor: 0, head: 5 } }).state;
  assert.equal(visible().length, 1);
  state = state.update({ effects: dismissSelectionToolbar.of(true) }).state;
  assert.equal(visible().length, 0);
  state = state.update({ selection: { anchor: 6, head: 11 } }).state;
  assert.equal(visible().length, 1);
  state = state.update({ selection: { anchor: 6 } }).state;
  assert.equal(visible().length, 0);
  const readonly = EditorState.create({ doc: 'locked', selection: { anchor: 0, head: 6 },
    extensions: [selectionToolbar, EditorState.readOnly.of(true)] });
  assert.equal(readonly.facet(showTooltip).filter(Boolean).length, 0);
});
