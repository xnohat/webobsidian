import assert from 'node:assert/strict';
import test from 'node:test';
import { toVaultTree } from '../lib/tree.js';

test('converts the GitHub docs tree into the existing WebObsidian tree shape', () => {
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

  assert.deepEqual(tree, {
    name: '',
    path: '',
    type: 'folder',
    children: [
      {
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
      },
    ],
  });
});
