import assert from 'node:assert/strict';
import test from 'node:test';
import type { TreeNode } from '../src/lib/api.js';
import { resolveWikilinkPath } from '../src/lib/tree.js';

const tree: TreeNode = {
  name: 'docs',
  path: 'docs',
  type: 'folder',
  children: [
    {
      name: '学习指南',
      path: 'docs/学习指南',
      type: 'folder',
      children: [
        {
          name: '入学准备.md',
          path: 'docs/学习指南/入学准备.md',
          type: 'file',
          ext: 'md',
        },
      ],
    },
    {
      name: '新生入门',
      path: 'docs/新生入门',
      type: 'folder',
      children: [
        {
          name: '入学准备.md',
          path: 'docs/新生入门/入学准备.md',
          type: 'file',
          ext: 'md',
        },
      ],
    },
  ],
};

const uniqueTree: TreeNode = {
  ...tree,
  children: tree.children?.slice(0, 1),
};

test('resolves a path-qualified wikilink relative to the hoisted vault root', () => {
  assert.equal(
    resolveWikilinkPath(tree, '学习指南/入学准备'),
    'docs/学习指南/入学准备.md',
  );
});

test('resolves an unambiguous note name and ignores its heading anchor', () => {
  assert.equal(
    resolveWikilinkPath(uniqueTree, '入学准备#报到流程'),
    'docs/学习指南/入学准备.md',
  );
});

test('does not guess when multiple notes share a basename', () => {
  assert.equal(resolveWikilinkPath(tree, '入学准备'), null);
});
