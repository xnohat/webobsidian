import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertReadableFilePath,
  assertReadableMarkdownPath,
  assertWritableMarkdownPath,
  normalizeRepoPath,
} from '../lib/paths.js';

test('normalizes Windows separators without leaving the repository root', () => {
  assert.equal(normalizeRepoPath('docs\\guide\\intro.md'), 'docs/guide/intro.md');
});

test('accepts Markdown documents under docs', () => {
  assert.equal(assertReadableMarkdownPath('docs/选课/计算机学院.md'), 'docs/选课/计算机学院.md');
});

test('rejects traversal and protected repository files', () => {
  assert.throws(() => assertReadableMarkdownPath('../.github/workflows/deploy.yml'));
  assert.throws(() => assertReadableMarkdownPath('docs/../package.json'));
  assert.throws(() => assertReadableMarkdownPath('.github/workflows/deploy.md'));
});

test('allows images for reading but never for contribution writes', () => {
  assert.throws(() => assertReadableMarkdownPath('docs/image.png'));
  assert.equal(assertReadableFilePath('docs/关于本站/attachments/说明.png'), 'docs/关于本站/attachments/说明.png');
  assert.throws(() => assertWritableMarkdownPath('docs/image.png'));
  assert.throws(() => assertReadableFilePath('docs/archive.zip'));
});
