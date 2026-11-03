import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import * as colors from '../src/lib/colorFormatting';
import { renderMarkdown } from '../src/lib/markdown';

function editor(doc: string, from = 0, to = doc.length, readonly = false) {
  const view = {
    state: EditorState.create({ doc, selection: { anchor: from, head: to },
      extensions: [history(), EditorState.readOnly.of(readonly)] }),
    dispatch(...specs: any[]) { this.state = this.state.update(...specs).state; },
    focus() {},
  };
  view.dispatch = view.dispatch.bind(view);
  return view as unknown as EditorView;
}

test('text color preserves selected text and is undone in one action', () => {
  const view = editor('Hello world', 6, 11);
  colors.applyColor(view, 'color', '#ff0000');
  assert.equal(view.state.doc.toString(), 'Hello <span style="color:#ff0000">world</span>');
  assert.equal(view.state.sliceDoc(...[view.state.selection.main.from, view.state.selection.main.to] as [number, number]), 'world');
  assert.equal(undo(view), true);
  assert.equal(view.state.doc.toString(), 'Hello world');
});

test('recolor, combine background and reset without nesting or losing the other color', () => {
  const view = editor('text');
  colors.applyColor(view, 'color', '#f00');
  colors.applyColor(view, 'color', '#00ff00');
  colors.applyColor(view, 'background-color', '#ffff00');
  assert.equal(view.state.doc.toString(), '<span style="color:#00ff00;background-color:#ffff00">text</span>');
  colors.applyColor(view, 'color', null);
  assert.equal(view.state.doc.toString(), '<span style="background-color:#ffff00">text</span>');
  colors.applyColor(view, 'background-color', null);
  assert.equal(view.state.doc.toString(), 'text');
});

test('multiline formatting leaves Markdown paragraphs and blank lines separate', () => {
  const view = editor('one\n\ntwo');
  colors.applyColor(view, 'background-color', '#ffff00');
  assert.equal(view.state.doc.toString(), '<span style="background-color:#ffff00">one</span>\n\n<span style="background-color:#ffff00">two</span>');
});

test('caret colors its word, empty selection and read-only state do not insert markup', () => {
  const view = editor('hello world', 2, 2);
  colors.applyColor(view, 'color', '#ff0000');
  assert.equal(view.state.doc.toString(), '<span style="color:#ff0000">hello</span> world');
  for (const v of [editor('', 0, 0), editor('locked', 0, 6, true)]) {
    const before = v.state.doc.toString();
    assert.equal(colors.applyColor(v, 'color', '#ff0000'), false);
    assert.equal(v.state.doc.toString(), before);
  }
});

test('multiline recolor and reset do not nest spans or damage blank lines', () => {
  const view = editor('one\n\ntwo');
  colors.applyColor(view, 'color', '#ff0000');
  colors.applyColor(view, 'color', '#00ff00');
  assert.equal(view.state.doc.toString(), '<span style="color:#00ff00">one</span>\n\n<span style="color:#00ff00">two</span>');
  colors.applyColor(view, 'color', null);
  assert.equal(view.state.doc.toString(), 'one\n\ntwo');
});

test('invalid CSS is rejected without modifying source', () => {
  const view = editor('safe');
  assert.equal(colors.applyColor(view, 'color', 'red;position:fixed'), false);
  assert.equal(view.state.doc.toString(), 'safe');
});

test('alpha colors normalize and partial reset splits spans preserving background', () => {
  const view = editor('abc');
  assert.equal(colors.applyColor(view, 'color', '#AaBBcc80'), true);
  colors.applyColor(view, 'background-color', '#11223344');
  const doc = view.state.doc.toString(), from = doc.indexOf('>') + 2;
  view.dispatch({ selection: { anchor: from, head: from + 1 } });
  assert.equal(colors.applyColor(view, 'color', null), true);
  assert.equal(view.state.doc.toString(), '<span style="color:#aabbcc80;background-color:#11223344">a</span><span style="background-color:#11223344">b</span><span style="color:#aabbcc80;background-color:#11223344">c</span>');
});

test('partial nested color replacement preserves unselected portions and nested background', () => {
  const doc = '<span style="color:#ff0000">a<span style="background-color:#ffff00">bc</span>d</span>';
  const from = doc.indexOf('bc');
  const view = editor(doc, from, from + 1);
  colors.applyColor(view, 'color', '#00ff00');
  assert.equal(view.state.doc.toString(), '<span style="color:#ff0000">a</span><span style="color:#00ff00;background-color:#ffff00">b</span><span style="color:#ff0000"><span style="background-color:#ffff00">c</span>d</span>');
});

test('resetting an absent color on part of an emphasis wrapper is a no-op', () => {
  const view = editor('**abc**', 3, 4);
  assert.equal(colors.applyColor(view, 'color', null), false);
  assert.equal(view.state.doc.toString(), '**abc**');
});

test('carets inside the same word color it once without duplicating text', () => {
  const view = editor('word');
  view.state = EditorState.create({doc:'word', selection:EditorSelection.create([
    EditorSelection.cursor(1), EditorSelection.cursor(3),
  ],1), extensions:[history(),EditorState.allowMultipleSelections.of(true)]});
  colors.applyColor(view, 'color', '#ff0000');
  assert.equal(view.state.doc.toString(), '<span style="color:#ff0000">word</span>');
  assert.equal(undo(view), true);
  assert.equal(view.state.doc.toString(), 'word');
});

test('reset and recolor accept every inert style spelling admitted by the sanitizer', () => {
  const view = editor('<span style=" COLOR : #f00 ; background-color: #11223380; ">word</span>');
  assert.equal(colors.applyColor(view, 'color', null), true);
  assert.equal(view.state.doc.toString(), '<span style="background-color:#11223380">word</span>');
  colors.applyColor(view, 'background-color', null);
  assert.equal(view.state.doc.toString(), 'word');
});

test('background around a colored subset can be recolored and reset without losing text color', () => {
  const view = editor('hello world', 6, 11);
  colors.applyColor(view, 'color', '#ff0000');
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
  const colored = view.state.doc.toString();
  colors.applyColor(view, 'background-color', '#ffff00');
  colors.applyColor(view, 'background-color', '#00ff00');
  assert.equal(view.state.doc.toString(), `<span style="background-color:#00ff00">${colored}</span>`);
  assert.equal(colors.applyColor(view, 'background-color', null), true);
  assert.equal(view.state.doc.toString(), colored);
});

test('Markdown preview preserves toolbar hex colors, inert named colors and Markdown emphasis', async () => {
  const html = await renderMarkdown('<span style="color:#ff0000;background-color:#ffff00">**bold**</span>\n\n<span style="position:fixed;color:red" onclick="alert(1)">unsafe</span>', { rawUrl: p => p });
  assert.match(html, /style="color:#ff0000;background-color:#ffff00"/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /style="color: red"/);
  assert.doesNotMatch(html, /position:|onclick/);
});

test('coloring multiline lists, tasks, headings and quotes preserves Markdown structure', async () => {
  for (const [source, expected] of [
    ['- one\n- two', /<ul>[^]*<li><span style="color:#ff0000">one<\/span><\/li>/],
    ['# Heading\n\ntext', /<h1><span style="color:#ff0000">Heading<\/span><\/h1>/],
    ['> quote\n> next', /<blockquote>/],
    ['- [ ] task\n- [x] done', /class="task-list-item/],
  ] as const) {
    const view = editor(source);
    colors.applyColor(view, 'color', '#ff0000');
    const html = await renderMarkdown(view.state.doc.toString(), { rawUrl: p => p });
    assert.match(html, expected, view.state.doc.toString());
  }
});
