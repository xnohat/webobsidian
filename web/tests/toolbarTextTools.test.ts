import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transformText } from '../src/lib/toolbar/commands/textTools';

// Hand-derived from the pinned upstream textEnhancement helpers; safer CRLF,
// escaping, missing-match, and selection-only behavior is asserted separately.
const fixtures: { id: string; input: string; params?: Record<string, string>; output: string }[] = [
  { id: 'get-plain-text', input: '# Title\n**Bold** and *italic* [label](https://example.org)\n> ==🟠Color== <u>under</u> [[Page]]', output: 'Title\nBold and italic label\nColor under Page' },
  { id: 'smart-symbols', input: '中文,测试! English中文', output: '中文，测试！ English 中文' },
  { id: 'insert-blank-lines', input: 'one\ntwo\nthree\n', output: 'one\n\ntwo\n\nthree\n' },
  { id: 'remove-blank-lines', input: 'one\n\n \t\ntwo\n', output: 'one\ntwo' },
  { id: 'split-lines', input: 'one, "two,three", 四', output: 'one\n"two,three"\n四' },
  { id: 'merge-lines', input: 'first\nsecond\n\n中文\n测试', output: 'first second\n\n中文测试' },
  { id: 'dedupe-lines', input: ' β \nα\nβ\n\n\nα', output: ' β \nα\n\n' },
  { id: 'add-wrap', input: 'one\n\ntwo', params: { prefix: '[', suffix: ']' }, output: '[one]\n\n[two]' },
  { id: 'number-lines', input: '9. first\n\n2) second', params: { start: '3', step: '2', sep: ') ' }, output: '3) first\n\n5) second' },
  { id: 'remove-whitespace-trim', input: '  one\t \n\ttwo　', output: 'one\ntwo' },
  { id: 'remove-whitespace-compress', input: 'one 　two\t  three', output: 'one two\t three' },
  { id: 'remove-whitespace-all', input: ' one\t　two\n three ', output: 'onetwo\nthree' },
  { id: 'list-to-table', input: '- Fruit\n  - Apple\n  - Pear\n- Veg\n  - Carrot', output: '| Item | Content 1 |\n| --- | --- |\n| Fruit | Apple<br>Pear |\n| Veg | Carrot |' },
  { id: 'table-to-list', input: '| Item | Content 1 |\n| --- | --- |\n| Fruit | Apple |\n| Veg | Carrot |', output: '- Fruit\n  - Apple\n- Veg\n  - Carrot' },
  { id: 'extract-between', input: 'before [α] middle [β] after', params: { start: '[', end: ']' }, output: 'α\nβ' },
];

for (const fixture of fixtures) {
  test(`${fixture.id}: transforms the upstream fixture through short and full IDs`, () => {
    for (const id of [fixture.id, `editing-toolbar:${fixture.id}`]) {
      assert.deepEqual(transformText(id, fixture.input, fixture.params ?? {}), { output: fixture.output, warnings: [] });
    }
  });
}

test('line transforms preserve CRLF without moving carriage returns into content', () => {
  assert.equal(transformText('add-wrap', 'α\r\nβ\r\n', { prefix: '[', suffix: ']' }).output, '[α]\r\n[β]\r\n');
  assert.equal(transformText('insert-blank-lines', 'α\r\nβ\r\nγ', {}).output, 'α\r\n\r\nβ\r\n\r\nγ');
  assert.equal(transformText('dedupe-lines', 'α\r\nβ\r\nα', {}).output, 'α\r\nβ');
  assert.equal(transformText('remove-whitespace-trim', ' α \r\n β ', {}).output, 'α\r\nβ');
  assert.equal(transformText('remove-whitespace-all', ' α \r\n β ', {}).output, 'α\r\nβ');
});

test('blank-line insertion is idempotent and preserves existing paragraph spacing', () => {
  assert.equal(transformText('insert-blank-lines', 'one\n\ntwo\n \nthree', {}).output, 'one\n\ntwo\n \nthree');
});

test('split-lines detects lists and ignores decimals and separators inside nested brackets', () => {
  assert.equal(transformText('split-lines', '1. one 2. two 3. 三', {}).output, 'one\ntwo\n三');
  assert.equal(transformText('split-lines', 'a, (b, [c,d]), e', {}).output, 'a\n(b, [c,d])\ne');
  assert.equal(transformText('split-lines', 'a::b::c', { sep: '::' }).output, 'a\nb\nc');
  const unchanged = transformText('split-lines', 'value 1.25', {});
  assert.equal(unchanged.output, 'value 1.25');
  assert.equal(unchanged.warnings.length, 1);
});

test('merge-lines accepts a literal custom separator and skips blank lines', () => {
  assert.equal(transformText('merge-lines', ' α \n\n β \nγ', { sep: ' | ' }).output, 'α | β | γ');
  assert.equal(transformText('merge-lines', 'one\r\ntwo\r\n\r\nthree', {}).output, 'one two\r\n\r\nthree');
});

test('dedupe is stable, case-sensitive, and retains the first original indentation', () => {
  assert.equal(transformText('dedupe-lines', '\t猫\nDog\n猫 \ndog\nDog', {}).output, '\t猫\nDog\ndog');
});

test('numbering preserves genuine digits in content and validates numeric parameters', () => {
  assert.equal(transformText('number-lines', '2026 release\n8. item\n😀', { start: '0', step: '-1', sep: ': ', prefix: '#' }).output, '#0: 2026 release\n#-1: item\n#-2: 😀');
  for (const params of [{ start: 'NaN' }, { step: '2.5' }, { start: 'Infinity' }]) {
    const result = transformText('number-lines', 'one\ntwo', params);
    assert.equal(result.output, 'one\ntwo');
    assert.equal(result.warnings.length, 1);
  }
});

test('smart symbols protect code, math, URLs and whole Markdown links', () => {
  assert.equal(transformText('smart-symbols', '中文中文中文中文, `x,y!` $a,b$ https://a.test/x,y [label](https://a.test)', {}).output,
    '中文中文中文中文， `x,y!` $a,b$ https://a.test/x,y [label](https://a.test)');
  assert.equal(transformText('smart-symbols', 'Hello，world！', {}).output, 'Hello, world! ');
  assert.equal(transformText('smart-symbols', '😀ＡＢＣ', {}).output, '😀ＡＢＣ');
});

test('plain text keeps Unicode, code contents, escaped formatting and does not execute HTML', () => {
  assert.equal(transformText('get-plain-text', '😀 _word_ `a*b` \\*literal\\* ![alt](image.png) [[Note|Alias]]', {}).output,
    '😀 word a*b *literal* alt Alias');
  assert.equal(transformText('get-plain-text', '<span onclick="bad()">Safe</span> <script>evil()</script>', {}).output, 'Safe evil()');
});

test('list/table conversion preserves escaped pipes and tabs as indentation', () => {
  const list = '- A|B\n\t- C\\|D';
  const table = '| Item | Content 1 |\n| --- | --- |\n| A\\|B | C\\|D |';
  assert.equal(transformText('list-to-table', list, {}).output, table);
  assert.equal(transformText('table-to-list', table, {}).output, '- A|B\n  - C|D');
  assert.equal(transformText('table-to-list', '| Name | Value |\r\n| :--- | ---: |\r\n| α | β |', {}).output,
    '- Name\r\n  - Value\r\n- α\r\n  - β');
});

test('three-level lists produce path columns without repeating ancestor labels', () => {
  assert.equal(transformText('list-to-table', '- A\n  - B\n    - C\n    - D\n  - E\n    - F', {}).output,
    '| Item | Content 1 | Content 2 |\n| --- | --- | --- |\n| A | B | C |\n|  |  | D |\n|  | E | F |');
});

test('invalid list/table inputs are preserved with a warning', () => {
  for (const id of ['list-to-table', 'table-to-list']) {
    const result = transformText(id, 'plain prose', {});
    assert.equal(result.output, 'plain prose');
    assert.equal(result.warnings.length, 1);
  }
});

test('extraction treats delimiters literally and includes multiline content', () => {
  assert.equal(transformText('extract-between', '.*[α\r\nβ]$ .*[γ]$', { start: '.*[', end: ']$' }).output, 'α\r\nβ\r\nγ');
  assert.equal(transformText('extract-between', '[a][b]', { start: '[', end: ']' }).output, 'a\nb');
  assert.equal(transformText('extract-between', 'start<>end', { start: '<', end: '>' }).output, '');
  for (const params of [{ start: '[', end: ']' }, { start: '', end: '' }]) {
    const result = transformText('extract-between', 'no matches', params);
    assert.equal(result.output, 'no matches');
    assert.equal(result.warnings.length, 1);
  }
});

test('empty selections and unknown tools never synthesize or erase text', () => {
  for (const fixture of fixtures) assert.equal(transformText(fixture.id, '', fixture.params ?? {}).output, '');
  const result = transformText('unknown-tool', 'keep me', {});
  assert.equal(result.output, 'keep me');
  assert.equal(result.warnings.length, 1);
});
