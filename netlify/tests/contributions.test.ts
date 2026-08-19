import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionBranch, validateContributionInput } from '../lib/contributions.js';

test('validates and normalizes a Markdown contribution', () => {
  assert.deepEqual(
    validateContributionInput({
      title: ' 更新选课经验 ',
      contributor: { name: ' 张三 ' },
      files: [{ path: 'docs\\选课\\计算机学院.md', content: '# 内容' }],
    }),
    {
      title: '更新选课经验',
      contributorName: '张三',
      files: [{ path: 'docs/选课/计算机学院.md', content: '# 内容' }],
    },
  );
});

test('rejects duplicate paths, protected paths, and oversized files', () => {
  assert.throws(() =>
    validateContributionInput({
      title: 'Duplicate',
      contributor: { name: 'Tester' },
      files: [
        { path: 'docs/a.md', content: 'a' },
        { path: 'DOCS/A.md', content: 'b' },
      ],
    }),
  );
  assert.throws(() =>
    validateContributionInput({
      title: 'Workflow',
      contributor: { name: 'Tester' },
      files: [{ path: '.github/workflows/deploy.md', content: 'unsafe' }],
    }),
  );
  assert.throws(() =>
    validateContributionInput({
      title: 'Large',
      contributor: { name: 'Tester' },
      files: [{ path: 'docs/large.md', content: 'x'.repeat(256 * 1024 + 1) }],
    }),
  );
});

test('creates an opaque, date-prefixed contribution branch', () => {
  assert.equal(
    createContributionBranch(new Date('2026-08-19T01:02:03Z'), 'A1B2-C3D4-E5F6'),
    'contrib/20260819-a1b2c3d4',
  );
});

test('accepts only editor-generated branches for contribution updates', () => {
  const input = {
    title: 'Update existing PR',
    contributor: { name: 'Tester' },
    files: [{ path: 'docs/a.md', content: 'updated' }],
  };
  assert.equal(
    validateContributionInput({ ...input, branch: 'contrib/20260819-a1b2c3d4' }).branch,
    'contrib/20260819-a1b2c3d4',
  );
  assert.throws(() => validateContributionInput({ ...input, branch: 'main' }), /contribution branch/);
  assert.throws(
    () => validateContributionInput({ ...input, branch: 'contrib/20260819-../../main' }),
    /contribution branch/,
  );
});
