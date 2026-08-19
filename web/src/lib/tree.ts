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

/** Resolve an Obsidian wikilink target from the already-loaded vault tree. */
export function resolveNotePath(root: TreeNode | null, target: string): string | null {
  if (!root) return null;
  const raw = target.split('#')[0].trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw) return null;
  const wanted = /\.[^/]+$/.test(raw) ? raw : `${raw}.md`;
  const exact = findNode(root, wanted);
  if (exact?.type === 'file') return exact.path;

  const wantedName = wanted.split('/').pop()!.toLowerCase();
  const matches: string[] = [];
  const stack = [...(root.children ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'file' && node.name.toLowerCase() === wantedName) matches.push(node.path);
    if (node.children) stack.push(...node.children);
  }
  return matches.length === 1 ? matches[0] : null;
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
