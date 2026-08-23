import assert from 'node:assert/strict';
import test from 'node:test';
import { toVaultTree } from '../lib/tree.js';

test('hoists docs/ as the root node in the WebObsidian tree', () => {
  const tree = toVaultTree({
    sha: 'root',
    truncated: false,
    tree: [
      { path: '.github', mode: '040000', type: 'tree', sha: 'ignored' },
      { path: 'docs', mode: '040000', type: 'tree', sha: 'docs' },
      { path: 'docs/Guide', mode: '040000', type: 'tree', sha: 'guide' },
      { path: 'docs/Guide/Start.md', mode: '100644', type: 'blob', sha: 'note', size: 42 },
      { path: 'docs/Guide/image.png', mode: '100644', type: 'blob', sha: 'image', size: 84 },
      { path: 'package.json', mode: '100644', type: 'blob', sha: 'ignored-file', size: 10 },
    ],
  });

  // toVaultTree now returns the docs/ node as root so the sidebar shows its
  // contents at the top level and the footer label reads "docs".
  assert.deepEqual(tree, {
    name: 'docs',
    path: 'docs',
    type: 'folder',
    children: [
      {
        name: 'Guide',
        path: 'docs/Guide',
        type: 'folder',
        children: [
          {
            name: 'image.png',
            path: 'docs/Guide/image.png',
            type: 'file',
            ext: 'png',
            size: 84,
          },
          {
            name: 'Start.md',
            path: 'docs/Guide/Start.md',
            type: 'file',
            ext: 'md',
            size: 42,
          },
        ],
      },
    ],
  });
});

test('falls back to the full root when no docs/ folder is present', () => {
  const tree = toVaultTree({
    sha: 'root',
    truncated: false,
    tree: [],
  });

  assert.deepEqual(tree, { name: '', path: '', type: 'folder', children: [] });
});
