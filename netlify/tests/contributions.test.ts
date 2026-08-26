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

test('accepts reviewed image attachments only as base64 under docs', () => {
  assert.deepEqual(
    validateContributionInput({
      title: '新增带图文档',
      contributor: { name: 'Lucas' },
      files: [
        { path: 'docs/指南/新文档.md', content: '# 新文档' },
        {
          path: 'docs/指南/attachments/示例.png',
          content: 'iVBORw0KGgo=',
          encoding: 'base64',
        },
      ],
    }),
    {
      title: '新增带图文档',
      contributorName: 'Lucas',
      files: [
        { path: 'docs/指南/新文档.md', content: '# 新文档' },
        {
          path: 'docs/指南/attachments/示例.png',
          content: 'iVBORw0KGgo=',
          encoding: 'base64',
        },
      ],
    },
  );
  assert.throws(
    () => validateContributionInput({
      title: '非法附件',
      contributor: { name: 'Lucas' },
      files: [{ path: 'docs/指南/script.svg', content: 'PHN2Zz4=', encoding: 'base64' }],
    }),
    /supported image/,
  );
  assert.throws(
    () => validateContributionInput({
      title: '附件路径错误',
      contributor: { name: 'Lucas' },
      files: [
        { path: 'docs/指南/新文档.md', content: '# 新文档' },
        { path: 'docs/指南/示例.png', content: 'iVBORw0KGgo=', encoding: 'base64' },
      ],
    }),
    /attachments folder/,
  );
});
