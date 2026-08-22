import assert from 'node:assert/strict';
import test from 'node:test';
import type { TreeNode } from '../../web/src/lib/api.js';
import { resolveAssetPath } from '../../web/src/lib/tree.js';

const tree: TreeNode = {
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
          name: '关于本站',
          path: 'docs/关于本站',
          type: 'folder',
          children: [
            {
              name: 'attachments',
              path: 'docs/关于本站/attachments',
              type: 'folder',
              children: [
                {
                  name: '贡献-修改.png',
                  path: 'docs/关于本站/attachments/贡献-修改.png',
                  type: 'file',
                  ext: 'png',
                },
              ],
            },
            { name: '贡献.md', path: 'docs/关于本站/贡献.md', type: 'file', ext: 'md' },
          ],
        },
      ],
    },
  ],
};

test('resolves Obsidian image embeds from the active note attachments folder', () => {
  assert.equal(
    resolveAssetPath(tree, '贡献-修改.png', 'docs/关于本站/贡献.md'),
    'docs/关于本站/attachments/贡献-修改.png',
  );
});
