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

/** Resolve an Obsidian attachment target relative to the active note. */
export function resolveAssetPath(
  root: TreeNode | null,
  target: string,
  activePath: string | null,
): string | null {
  if (!root || !target) return null;
  const cleanTarget = target.split('#')[0].replaceAll('\\', '/').replace(/^\.\//, '');
  const noteDir = activePath?.includes('/') ? activePath.slice(0, activePath.lastIndexOf('/')) : '';
  const basename = cleanTarget.slice(cleanTarget.lastIndexOf('/') + 1);
  const candidates = [
    cleanTarget,
    noteDir && `${noteDir}/${cleanTarget}`,
    noteDir && `${noteDir}/attachments/${basename}`,
  ].filter((path): path is string => Boolean(path));

  for (const path of candidates) {
    const node = findNode(root, path);
    if (node?.type === 'file') return node.path;
  }

  const matches: string[] = [];
  const stack = [...(root.children ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'file' && node.name === basename) matches.push(node.path);
    if (node.children) stack.push(...node.children);
  }
  return matches.length === 1 ? matches[0] : null;
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
