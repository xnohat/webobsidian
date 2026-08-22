import type { TreeNode } from './api';

/** Find a node by its vault-relative path anywhere in the tree (null if absent). */
export function findNode(root: TreeNode | null, path: string): TreeNode | null {
  if (!root || !path) return null;
  const stack: TreeNode[] = [...(root.children ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.path === path) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

/** True if the path resolves to a folder node in the tree. */
export function isFolderPath(root: TreeNode | null, path: string | null): boolean {
  return !!path && findNode(root, path)?.type === 'folder';
}

/**
 * Drop any path that is nested under another path in the set. Used before bulk
 * move/delete so a folder and one of its own children aren't both operated on
 * (the child would already be gone with the parent → a spurious error).
 */
export function pruneDescendants(paths: string[]): string[] {
  const sorted = [...new Set(paths)].sort((a, b) => a.length - b.length);
  const keep: string[] = [];
  for (const p of sorted) if (!keep.some((k) => p === k || p.startsWith(`${k}/`))) keep.push(p);
  return keep;
}
