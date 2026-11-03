import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../src/lib/api';
import {
  dateStamp,
  findTemplatesFolder,
  listTemplates,
  resolveTargetFolder,
  slugify,
  substituteTemplate,
  targetCandidates,
  timeStamp,
  uniqueNotePath,
} from '../src/lib/templates';

/** Folder/file node helpers — a tree is just nested nodes. */
const folder = (path: string, children: TreeNode[] = []): TreeNode => ({
  name: path.split('/').pop() || path,
  path,
  type: 'folder',
  children,
});
const file = (path: string, ext = 'md'): TreeNode => ({
  name: path.split('/').pop()!,
  path,
  type: 'file',
  ext,
});

/** The shape of the vault this ships against: templates in Wiki/templates. */
const vault = folder('', [
  folder('Wiki', [
    folder('Wiki/templates', [
      file('Wiki/templates/meeting.md'),
      file('Wiki/templates/daily.md'),
      file('Wiki/templates/query.md'),
      file('Wiki/templates/abnormality.md'),
      file('Wiki/templates/weekly-review.md'),
      file('Wiki/templates/shift-handover.md'),
      file('Wiki/templates/notes.txt', 'txt'),
    ]),
    folder('Wiki/meetings'),
    folder('Wiki/queries'),
    folder('Wiki/daily'),
    folder('Wiki/concepts', [folder('Wiki/concepts/templates')]),
    folder('Wiki/reviews'),
    folder('Wiki/tasks'),
  ]),
  file('templates.md'),
]);

// ---- slugify -------------------------------------------------------------

test('slugify folds Vietnamese diacritics, including đ which NFD leaves alone', () => {
  assert.equal(slugify('Kiểm tra tem mới với Ban và Chiến'), 'kiem-tra-tem-moi-voi-ban-va-chien');
  assert.equal(slugify('Đổi OPU chuẩn'), 'doi-opu-chuan');
});

test('slugify collapses punctuation and whitespace runs into single hyphens', () => {
  assert.equal(slugify('QMS Review — 2026 (Ban/Chien)'), 'qms-review-2026-ban-chien');
  assert.equal(slugify('  spaced   out  '), 'spaced-out');
  assert.equal(slugify('trailing---'), 'trailing');
});

test('slugify caps the stem so a sentence-long title cannot make an unopenable path', () => {
  const slug = slugify('a '.repeat(80));
  assert.ok(slug.length <= 60, `slug is capped at 60 chars, got ${slug.length}`);
  assert.ok(!slug.endsWith('-'), 'a capped slug never ends on a hyphen');
});

// ---- timestamps ----------------------------------------------------------

test('dateStamp/timeStamp use local time and are zero-padded', () => {
  const d = new Date(2026, 8, 6, 7, 5); // 2026-09-06 07:05 local
  assert.equal(dateStamp(d), '2026-09-06');
  assert.equal(timeStamp(d), '07:05');
});

// ---- substitution --------------------------------------------------------

test('substituteTemplate fills every token', () => {
  const out = substituteTemplate('title: {{title}}\ncreated: {{date}} {{time}} ({{slug}})', {
    title: 'QMS Review',
    date: '2026-09-26',
    time: '07:05',
    slug: 'qms-review',
  });
  assert.equal(out, 'title: QMS Review\ncreated: 2026-09-26 07:05 (qms-review)');
});

test('substituteTemplate understands the literal YYYY-MM-DD shapes the vault already writes', () => {
  const t = { title: 'QMS Review', date: '2026-09-26', time: '07:05', slug: 'qms-review' };
  // The compound token must win: a bare-date-first order would leave `-slug`
  // in this source path and the nightly filing could not find the capture.
  assert.equal(
    substituteTemplate('sources: [raw/meetings/YYYY-MM-DD-slug.md]', t),
    'sources: [raw/meetings/2026-09-26-qms-review.md]',
  );
  assert.equal(substituteTemplate('date: YYYY-MM-DD', t), 'date: 2026-09-26');
  assert.equal(
    substituteTemplate('title: Meeting — subject YYYY-MM-DD', t),
    'title: Meeting — subject 2026-09-26',
  );
});

test('substituteTemplate leaves a template with no tokens untouched', () => {
  const body = '# Plain\n\n- nothing to fill\n';
  assert.equal(substituteTemplate(body, { title: 'x', date: '2026-09-26', time: '07:05', slug: 'x' }), body);
});

// ---- templates folder ----------------------------------------------------

test('findTemplatesFolder takes the shallowest folder named templates, at any case', () => {
  assert.equal(findTemplatesFolder(vault), 'Wiki/templates');
  const upper = folder('', [folder('Vault', [folder('Vault/Templates')])]);
  assert.equal(findTemplatesFolder(upper), 'Vault/Templates');
});

test('findTemplatesFolder returns null when there is none — a file named templates.md is not one', () => {
  assert.equal(findTemplatesFolder(vault.children![1] as TreeNode | null), null);
  assert.equal(findTemplatesFolder(folder('', [file('templates.md')])), null);
  assert.equal(findTemplatesFolder(null), null);
});

test('listTemplates returns markdown only, alphabetically, ignoring other extensions', () => {
  assert.deepEqual(listTemplates(vault, 'Wiki/templates').map((t) => t.title), [
    'abnormality',
    'daily',
    'meeting',
    'query',
    'shift-handover',
    'weekly-review',
  ]);
  assert.deepEqual(listTemplates(vault, null), []);
  assert.deepEqual(listTemplates(vault, 'Wiki/nope'), []);
});

// ---- target folder -------------------------------------------------------

test('targetCandidates pluralises then falls back to the name as written', () => {
  assert.deepEqual(targetCandidates('meeting'), ['meetings', 'meeting']);
  assert.deepEqual(targetCandidates('query'), ['queries', 'query']);
  assert.deepEqual(targetCandidates('abnormality'), ['abnormalities', 'abnormality']);
  assert.deepEqual(targetCandidates('daily'), ['dailies', 'daily']);
  assert.deepEqual(targetCandidates('weekly-review'), ['weekly-reviews', 'weekly-review', 'reviews', 'review']);
});

test('resolveTargetFolder finds the sibling folder each template belongs to', () => {
  assert.equal(resolveTargetFolder(vault, 'Wiki/templates/meeting.md'), 'Wiki/meetings');
  assert.equal(resolveTargetFolder(vault, 'Wiki/templates/query.md'), 'Wiki/queries');
  assert.equal(resolveTargetFolder(vault, 'Wiki/templates/daily.md'), 'Wiki/daily');
  assert.equal(resolveTargetFolder(vault, 'Wiki/templates/weekly-review.md'), 'Wiki/reviews');
});

test('resolveTargetFolder returns "" when the vault has no folder for the template', () => {
  // shift-handover → shift-handovers/handover(s): nothing in the tree matches.
  assert.equal(resolveTargetFolder(vault, 'Wiki/templates/shift-handover.md'), '');
});

test('resolveTargetFolder does not mistake a nested folder for a sibling', () => {
  // Wiki/concepts/templates exists, but meeting.md's target must be searched
  // among Wiki/'s children only.
  assert.equal(resolveTargetFolder(vault, 'Wiki/templates/meeting.md'), 'Wiki/meetings');
});

// ---- unique path ---------------------------------------------------------

test('uniqueNotePath appends -2, -3 … and never overwrites', () => {
  const taken = new Set<string>();
  const exists = (p: string) => taken.has(p);
  assert.equal(uniqueNotePath('Wiki/meetings', '2026-09-26-qms-review', exists), 'Wiki/meetings/2026-09-26-qms-review.md');
  taken.add('Wiki/meetings/2026-09-26-qms-review.md');
  assert.equal(uniqueNotePath('Wiki/meetings', '2026-09-26-qms-review', exists), 'Wiki/meetings/2026-09-26-qms-review-2.md');
  taken.add('Wiki/meetings/2026-09-26-qms-review-2.md');
  assert.equal(uniqueNotePath('Wiki/meetings', '2026-09-26-qms-review', exists), 'Wiki/meetings/2026-09-26-qms-review-3.md');
});

test('uniqueNotePath joins without a leading slash at the vault root', () => {
  assert.equal(uniqueNotePath('', '2026-09-26-note', () => false), '2026-09-26-note.md');
});
