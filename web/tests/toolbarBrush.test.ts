import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { captureFormat, applyFormat } from '../src/lib/toolbar/formatBrush';
import { clearFormatting } from '../src/lib/toolbar/formatCleanup';

function editor(doc: string, from = 0, to = doc.length, readonly = false) {
  const view = {
    state: EditorState.create({ doc, selection: { anchor: from, head: to },
      extensions: [history(), EditorState.readOnly.of(readonly)] }),
    dispatch(...specs: Parameters<EditorState['update']>) { this.state = this.state.update(...specs).state; },
    focus() {},
  };
  view.dispatch = view.dispatch.bind(view);
  return view as unknown as EditorView;
}

test('brush replaces absent styles, preserves text, and uses one Undo', () => {
  const format = captureFormat({ view: editor('**bold**') })!;
  assert.deepEqual(format.bold, { kind: 'set', value: true });
  assert.deepEqual(format.italic, { kind: 'clear' });
  const target = editor('*italic*');
  assert.equal(applyFormat({ view: target }, format).status, 'applied');
  assert.equal(target.state.doc.toString(), '**italic**');
  assert.equal(undo(target), true);
  assert.equal(target.state.doc.toString(), '*italic*');
});

test('mixed source keeps target attributes and uniform absent color clears it', () => {
  const format = captureFormat({ view: editor('**one** two') })!;
  assert.deepEqual(format.bold, { kind: 'keep' });
  assert.deepEqual(format.textColor, { kind: 'clear' });
  const target = editor('<span style="color:#ff0000">**target**</span>');
  applyFormat({ view: target }, format);
  assert.equal(target.state.doc.toString(), '**target**');
  const colors = captureFormat({ view: editor('<span style="color:#ff0000">a</span><span style="color:#00ff00">b</span>') })!;
  assert.deepEqual(colors.textColor, { kind: 'keep' });
  const colored = editor('<span style="color:#112233">target</span>');
  applyFormat({ view: colored }, colors);
  assert.equal(colored.state.doc.toString(), '<span style="color:#112233">target</span>');
});

test('empty source and read-only targets are unavailable', () => {
  assert.equal(captureFormat({ view: editor('word', 1, 1) }), null);
  const target = editor('locked', 0, 6, true);
  const format = captureFormat({ view: editor('**source**') })!;
  assert.equal(applyFormat({ view: target }, format).status, 'unavailable');
  assert.equal(clearFormatting({ view: target }).status, 'unavailable');
  assert.equal(target.state.doc.toString(), 'locked');
});

test('cleanup splits enclosing formats and preserves nested unselected content', () => {
  const doc = '<span style="color:#ff0000"><u>first **middle** last</u></span>';
  const from = doc.indexOf('middle');
  const view = editor(doc, from, from + 6);
  clearFormatting({ view });
  assert.equal(view.state.doc.toString(), '<span style="color:#ff0000"><u>first </u></span>middle<span style="color:#ff0000"><u> last</u></span>');
  assert.equal(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to), 'middle');
});

test('cleanup retains links, embeds, block prefixes, unknown HTML, and inline code', () => {
  const doc = '# **Heading**\n- [**label**](https://example.test/a) ![[image.png]] <custom>==keep==</custom> `**code**`';
  const view = editor(doc);
  clearFormatting({ view });
  assert.equal(view.state.doc.toString(), '# Heading\n- [label](https://example.test/a) ![[image.png]] <custom>keep</custom> `**code**`');
});

test('superscript capture and application clear conflicting subscript', () => {
  const format = captureFormat({ view: editor('<sup>source</sup>') })!;
  const target = editor('<sub>target</sub>');
  applyFormat({ view: target }, format);
  assert.equal(target.state.doc.toString(), '<sup>target</sup>');
});

test('nested bold and italic capture both attributes', () => {
  const format = captureFormat({ view: editor('***both***') })!;
  assert.deepEqual(format.bold, { kind: 'set', value: true });
  assert.deepEqual(format.italic, { kind: 'set', value: true });
  const target = editor('target');
  applyFormat({ view: target }, format);
  assert.equal(target.state.doc.toString(), '***target***');
});

test('nested emphasis retains its outer and inner boundaries', () => {
  const source = '*italic **both** italic*';
  const format = captureFormat({ view: editor(source, source.indexOf('both'), source.indexOf('both') + 4) })!;
  assert.deepEqual(format.bold, { kind: 'set', value: true });
  assert.deepEqual(format.italic, { kind: 'set', value: true });
});

test('cleanup protects YAML, fenced code, code-only selections, and unknown HTML attributes', () => {
  const doc = '---\ntitle: **literal**\n---\n```md\n**literal**\n```\n<custom data-value="**literal**">**text**</custom>';
  const view = editor(doc);
  clearFormatting({ view });
  assert.equal(view.state.doc.toString(), doc.replace('>**text**<', '>text<'));
  assert.equal(captureFormat({ view: editor('`**code**`') }), null);
  const code = editor('`code`');
  applyFormat({ view: code }, captureFormat({ view: editor('**source**') })!);
  assert.equal(code.state.doc.toString(), '`code`');
});

test('cleanup batches multiple selections in one span and preserves reversed ranges', () => {
  const doc = '<u>abc def ghi</u>', from = doc.indexOf('abc');
  const view = editor(doc);
  view.dispatch({ selection: EditorSelection.create([
    EditorSelection.range(from, from + 3), EditorSelection.range(from + 11, from + 8),
  ]), effects: [], });
  // Test states explicitly permit independent ranges, as the production editor does.
  view.state = EditorState.create({ doc, selection: view.state.selection,
    extensions: [EditorState.allowMultipleSelections.of(true), history()] });
  view.dispatch({ selection: EditorSelection.create([
    EditorSelection.range(from, from + 3), EditorSelection.range(from + 11, from + 8),
  ]) });
  clearFormatting({ view });
  assert.equal(view.state.doc.toString(), 'abc<u> def </u>ghi');
  assert.equal(view.state.selection.ranges.length, 2);
  assert.ok(view.state.selection.ranges[1].anchor > view.state.selection.ranges[1].head);
  assert.equal(undo(view), true);
  assert.equal(view.state.doc.toString(), doc);
});
