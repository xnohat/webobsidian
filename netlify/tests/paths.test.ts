import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReadableMarkdownPath, normalizeRepoPath } from '../lib/paths.js';

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

test('rejects non-Markdown files in the first read-only milestone', () => {
  assert.throws(() => assertReadableMarkdownPath('docs/image.png'));
});
