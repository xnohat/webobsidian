import type { GitHubTreeResponse } from './github.js';
import { isImagePath, isMarkdownPath, isReadableTreePath } from './paths.js';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  ext?: string;
  size?: number;
  children?: TreeNode[];
}

function nodeName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function toVaultTree(response: GitHubTreeResponse): TreeNode {
  const nodes = new Map<string, TreeNode>();
  const root: TreeNode = { name: '', path: '', type: 'folder', children: [] };
  nodes.set('', root);

  const entries = response.tree
    .filter(
      (entry) =>
        isReadableTreePath(entry.path)
        && (entry.type === 'tree' || isMarkdownPath(entry.path) || isImagePath(entry.path)),
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of entries) {
    const parts = entry.path.split('/');
    const parentPath = parts.slice(0, -1).join('/');
    const parent = nodes.get(parentPath);
    if (!parent?.children) continue;

    const isFolder = entry.type === 'tree';
    const name = nodeName(entry.path);
    const node: TreeNode = {
      name,
      path: entry.path,
      type: isFolder ? 'folder' : 'file',
      ...(isFolder ? { children: [] } : { ext: name.split('.').pop(), size: entry.size }),
    };
    parent.children.push(node);
    nodes.set(entry.path, node);
  }

  const sortChildren = (node: TreeNode) => {
    node.children?.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    node.children?.forEach(sortChildren);
  };
  sortChildren(root);

  // Hoist the docs/ directory to become the root node.  USC-Wiki stores all
  // editable content under docs/, so surfacing it as the top-level folder
  // removes a redundant layer and lets the sidebar footer show "docs" instead
  // of the generic "Vault" label.  All internal paths (e.g. docs/Guide/a.md)
  // remain unchanged so every other API call continues to work without
  // modification.
  const docsNode = root.children?.find(
    (c) => c.name.toLowerCase() === 'docs' && c.type === 'folder',
  );
  return docsNode ?? root;
}
